import * as cheerio from "cheerio";
import { BlogRepository } from "./blogRepository";
import prisma from "@/common/utils/prismaClient";
import { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { executablePath } from "puppeteer-core";

export class BlogService {
  private blogRepository: BlogRepository;
  private transporter: nodemailer.Transporter;

  constructor(repository: BlogRepository = new BlogRepository()) {
    this.blogRepository = repository;

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      service: "Gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async findAll() {
    try {
      return await this.blogRepository.findAllBlogs();
    } catch (error) {
      console.error("Error fetching all blogs:", error);
      throw new Error("Unable to fetch blogs");
    }
  }

  async findById(id: number) {
    try {
      return await this.blogRepository.findBlogById(id);
    } catch (error) {
      console.error(`Error fetching blog with id ${id}:`, error);
      throw new Error("Unable to fetch blog");
    }
  }

  async create(data: Prisma.BlogCreateInput) {
    try {
      return await this.blogRepository.createBlog(data);
    } catch (error) {
      console.error(`Error updating blog`, error);
      throw new Error("Unable to create blog");
    }
  }

  async update(id: number, data: Prisma.BlogUpdateInput) {
    try {
      return await this.blogRepository.updateBlog(id, data);
    } catch (error) {
      console.error(`Error updating blog with id ${id}:`, error);
      throw new Error("Unable to update blog");
    }
  }

  async delete(id: number) {
    try {
      await this.blogRepository.deleteBlog(id);
      return { message: "Blog deleted successfully" };
    } catch (error) {
      console.error(`Error deleting blog with id ${id}:`, error);
      throw new Error("Unable to delete blog");
    }
  }

  async summarize(title: string, content: string) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.75,
        },
      });

      const prompt = `Anda adalah copywriter dan akuntan yang sangat hebat, tolong rangkum hal hal informasi penting yang ada pada "${title}" dan konten "${content}". rangkuman tersebut akan menjadi satu pragraf yang terstruktur dan memiliki informasi penting yang terkandung dalam konten yang ada dengan maksimal 1000 output token.`;

      const result = await model.generateContent(prompt);
      if (!result || !result.response) {
        console.warn(
          "Fallback: Unable to generate summary, returning truncated content."
        );
        return content.substring(0, 200);
      }

      return result.response.text();
    } catch (error) {
      console.error("Error summarizing content:", error);
      throw new Error("Failed to summarize content");
    }
  }

  private ensureDirectoryExists(directory: string) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  async processPdf(pdfPath: string) {
    try {
      console.log(`Processing PDF at: ${pdfPath}`);
      const pdf = require("pdf-parse");
      const buffer = fs.readFileSync(pdfPath);
      const pdfData = await pdf(buffer);
      // console.log("pdf data : ", pdfData.text);
      return pdfData.text;
    } catch (error) {
      console.warn(
        `Warning: Could not fully process PDF at ${pdfPath}. Skipping.`
      );
      throw new Error("Failed to process PDF");
    }
  }

  sanitizeFilename(url: any) {
    const decodedFilename = decodeURIComponent(path.basename(url));

    // Sanitize the filename by removing invalid characters and trimming extra spaces
    return decodedFilename.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
  }

  async scrapeData() {
    try {
      const mainUrl = "https://www.ojk.go.id/id/Regulasi/Default.aspx";
      console.log(`Starting to scrape data from: ${mainUrl}`);

      const response = await axios.get(mainUrl);
      const $ = cheerio.load(response.data);

      console.log(`Successfully fetched main page. Parsing rows...`);

      const rows = $("tr");
      for (let index = 0; index < rows.length; index++) {
        try {
          console.log(`Processing row index: ${index}`);

          const element = rows[index];
          const row = $(element);
          const title = row.find("td").eq(1).text().trim();
          const content = row.find("td").eq(2).text().trim();
          const relativeUrl = row.find("td").eq(1).find("a").attr("href");

          console.log(`Found entry - Title: "${title}", Content: "${content}"`);

          if (!title || !content || !relativeUrl) {
            console.log(`Skipping row ${index} due to missing data.`);
            continue;
          }

          // Construct full detail page URL
          const detailUrl = new URL(
            relativeUrl,
            "https://www.ojk.go.id"
          ).toString();
          console.log(`Detail page URL for row ${index}: ${detailUrl}`);

          const detailResponse = await axios.get(detailUrl);
          const detailPage = cheerio.load(detailResponse.data);

          // Find all PDF links on the detail page
          const pdfLinks = detailPage("a")
            .filter((_, el) => $(el).attr("href")?.endsWith(".pdf"))
            .map((_, el) =>
              new URL($(el).attr("href")!, "https://www.ojk.go.id").toString()
            )
            .get();

          if (pdfLinks.length === 0) {
            console.log(`No PDF links found for detail page: ${detailUrl}`);
            continue;
          }

          console.log(
            `Found ${pdfLinks.length} PDF link(s) for row ${index}:`,
            pdfLinks
          );

          for (const [pdfIndex, pdfUrl] of pdfLinks.entries()) {
            console.log(
              `Processing PDF ${pdfIndex + 1} for row ${index}: ${pdfUrl}`
            );

            try {
              // Ensure directory for downloads exists
              this.ensureDirectoryExists("./downloads");

              const pdfPath = path.join("./downloads", path.basename(pdfUrl));
              console.log(`Downloading PDF to: ${pdfPath}`);

              const pdfResponse = await axios.get(pdfUrl, {
                responseType: "stream",
              });

              // Download the PDF file
              await new Promise((resolve, reject) => {
                pdfResponse.data
                  .pipe(fs.createWriteStream(pdfPath))
                  .on("finish", resolve)
                  .on("error", (error: any) => {
                    console.error(
                      `Error downloading PDF ${pdfIndex + 1} for row ${index}:`,
                      error
                    );
                    reject(error);
                  });
              });

              console.log(
                `PDF ${
                  pdfIndex + 1
                } downloaded successfully for row ${index}: ${pdfPath}`
              );

              // Process the PDF to extract content
              const processedContent = await this.processPdf(pdfPath);
              console.log(
                `Processed PDF content for PDF ${pdfIndex + 1} of row ${index}.`
              );

              // Generate a summarized version of the content
              const summarizedContent = await this.summarize(
                `${title} - PDF ${pdfIndex + 1}`,
                processedContent
              );
              console.log(
                `Summarized content generated for PDF ${
                  pdfIndex + 1
                } of row ${index}.`
              );

              // Save the data to the database with a unique identifier
              await prisma.blog.upsert({
                where: { url: pdfUrl },
                update: { content: summarizedContent },
                create: {
                  title: `${title} - PDF ${pdfIndex + 1}`,
                  content: summarizedContent,
                  url: pdfUrl,
                },
              });
              console.log(
                `Data saved to database for PDF ${
                  pdfIndex + 1
                } of row ${index}.`
              );
            } catch (pdfError) {
              console.error(
                `Error processing PDF ${pdfIndex + 1} for row ${index}:`,
                pdfError
              );
            }
          }
        } catch (rowError) {
          console.error(`Error processing row ${index}:`, rowError);
        }
      }

      console.log(`Scraping completed.`);
      return "Successfully scraped data";
    } catch (error) {
      console.error("Error scraping data:", error);
      throw new Error("Failed to scrape data");
    }
  }

  async scrapeDataOJK() {
    try {
      const mainUrl = "https://www.ojk.go.id/id/Regulasi/Default.aspx";
      console.log(`Starting to scrape data from: ${mainUrl}`);

      const response = await axios.get(mainUrl);
      const $ = cheerio.load(response.data);

      console.log(`Successfully fetched main page. Parsing rows...`);

      const rows = $("tr");
      for (let index = 0; index < rows.length; index++) {
        try {
          console.log(`Processing row index: ${index}`);

          const element = rows[index];
          const row = $(element);
          const title = row.find("td").eq(1).text().trim();
          const content = row.find("td").eq(2).text().trim();
          const relativeUrl = row.find("td").eq(1).find("a").attr("href");

          console.log(`Found entry - Title: "${title}", Content: "${content}"`);

          if (!title || !content || !relativeUrl) {
            console.log(`Skipping row ${index} due to missing data.`);
            continue;
          }

          // Check if the title already exists in the database
          const existingEntry = await prisma.blog.findUnique({
            where: { title },
          });

          if (existingEntry) {
            console.log(
              `Skipping row ${index} as the title already exists in the database.`
            );
            continue;
          }

          // Construct full detail page URL
          const detailUrl = new URL(
            relativeUrl,
            "https://www.ojk.go.id"
          ).toString();
          console.log(`Detail page URL for row ${index}: ${detailUrl}`);

          const detailResponse = await axios.get(detailUrl);
          const detailPage = cheerio.load(detailResponse.data);

          // Find all PDF links on the detail page
          const pdfLinks = detailPage("a")
            .filter((_, el) => $(el).attr("href")?.endsWith(".pdf"))
            .map((_, el) =>
              new URL($(el).attr("href")!, "https://www.ojk.go.id").toString()
            )
            .get();

          if (pdfLinks.length === 0) {
            console.log(`No PDF links found for detail page: ${detailUrl}`);
            continue;
          }

          console.log(
            `Found ${pdfLinks.length} PDF link(s) for row ${index}:`,
            pdfLinks
          );

          for (const [pdfIndex, pdfUrl] of pdfLinks.entries()) {
            console.log(
              `Processing PDF ${pdfIndex + 1} for row ${index}: ${pdfUrl}`
            );

            try {
              // Ensure directory for downloads exists
              this.ensureDirectoryExists("./downloads");

              const pdfPath = path.join("./downloads", path.basename(pdfUrl));
              console.log(`Downloading PDF to: ${pdfPath}`);

              const pdfResponse = await axios.get(pdfUrl, {
                responseType: "stream",
              });

              // Download the PDF file
              await new Promise((resolve, reject) => {
                pdfResponse.data
                  .pipe(fs.createWriteStream(pdfPath))
                  .on("finish", resolve)
                  .on("error", (error: any) => {
                    console.error(
                      `Error downloading PDF ${pdfIndex + 1} for row ${index}:`,
                      error
                    );
                    reject(error);
                  });
              });

              console.log(
                `PDF ${
                  pdfIndex + 1
                } downloaded successfully for row ${index}: ${pdfPath}`
              );

              // Process the PDF to extract content
              const processedContent = await this.processPdf(pdfPath);
              console.log(
                `Processed PDF content for PDF ${pdfIndex + 1} of row ${index}.`
              );

              // Generate a summarized version of the content
              const summarizedContent = await this.summarize(
                `${title} - PDF ${pdfIndex + 1}`,
                processedContent
              );
              console.log(
                `Summarized content generated for PDF ${
                  pdfIndex + 1
                } of row ${index}.`
              );

              // Save the data to the database with a unique identifier
              await prisma.blog.upsert({
                where: { url: pdfUrl },
                update: { content: summarizedContent },
                create: {
                  title: `${title} - PDF ${pdfIndex + 1}`,
                  content: summarizedContent,
                  url: pdfUrl,
                },
              });
              console.log(
                `Data saved to database for PDF ${
                  pdfIndex + 1
                } of row ${index}.`
              );
            } catch (pdfError) {
              console.error(
                `Error processing PDF ${pdfIndex + 1} for row ${index}:`,
                pdfError
              );
            }
          }
        } catch (rowError) {
          console.error(`Error processing row ${index}:`, rowError);
        }
      }

      console.log(`Scraping completed.`);
      return "Successfully scraped data";
    } catch (error) {
      console.error("Error scraping data:", error);
      throw new Error("Failed to scrape data");
    }
  }

  async scrapeDataKemenkeu() {
    try {
      const mainUrl = "https://setpp.kemenkeu.go.id/risalah/indexPutusan";
      console.log(`Starting to scrape data from: ${mainUrl}`);

      const response = await axios.get(mainUrl);
      const $ = cheerio.load(response.data);

      console.log(`Successfully fetched main page. Parsing rows...`);

      const rows = $("tr");
      for (let index = 0; index < rows.length; index++) {
        try {
          console.log(`Processing row index: ${index}`);

          const element = rows[index];
          const row = $(element);
          const relativeUrl = row.find("td").eq(1).find("a").attr("href");
          const title = row.find("td").eq(1).find("a").text().trim();
          const abstraction = row.find("td").eq(2).text().trim();

          console.log(
            `Found entry - Title: "${title}", Content: "${abstraction}"`
          );

          if (!title || !abstraction || !relativeUrl) {
            console.log(`Skipping row ${index} due to missing data.`);
            continue;
          }

          // Check if the title already exists in the database
          const existingEntry = await prisma.blog.findUnique({
            where: { title },
          });

          if (existingEntry) {
            console.log(
              `Skipping row ${index} as the title already exists in the database.`
            );
            continue;
          }

          // Construct full detail page URL
          const detailUrl = new URL(
            relativeUrl,
            "https://setpp.kemenkeu.go.id"
          ).toString();
          console.log(`Detail page URL for row ${index}: ${detailUrl}`);

          if (!detailUrl) {
            console.log(`No PDF links found for detail page: ${detailUrl}`);
            continue;
          }

          console.log(
            `Found ${detailUrl} PDF link(s) for row ${index}:`,
            detailUrl
          );

          for (const [pdfIndex, pdfUrl] of detailUrl.entries()) {
            console.log(
              `Processing PDF ${pdfIndex + 1} for row ${index}: ${pdfUrl}`
            );

            try {
              // Ensure directory for downloads exists
              this.ensureDirectoryExists("./downloads");

              const pdfPath = path.join("./downloads", path.basename(pdfUrl));
              console.log(`Downloading PDF to: ${pdfPath}`);

              const pdfResponse = await axios.get(pdfUrl, {
                responseType: "stream",
              });

              // Download the PDF file
              await new Promise((resolve, reject) => {
                pdfResponse.data
                  .pipe(fs.createWriteStream(pdfPath))
                  .on("finish", resolve)
                  .on("error", (error: any) => {
                    console.error(
                      `Error downloading PDF ${pdfIndex + 1} for row ${index}:`,
                      error
                    );
                    reject(error);
                  });
              });

              console.log(
                `PDF ${
                  pdfIndex + 1
                } downloaded successfully for row ${index}: ${pdfPath}`
              );

              // Process the PDF to extract content
              const processedContent = await this.processPdf(pdfPath);
              console.log(
                `Processed PDF content for PDF ${pdfIndex + 1} of row ${index}.`
              );

              // Generate a summarized version of the content
              const summarizedContent = await this.summarize(
                `${title} - PDF ${pdfIndex + 1}`,
                processedContent
              );
              console.log(
                `Summarized content generated for PDF ${
                  pdfIndex + 1
                } of row ${index}.`
              );

              // Save the data to the database with a unique identifier
              await prisma.blog.upsert({
                where: { url: pdfUrl },
                update: { content: summarizedContent },
                create: {
                  title: `${title} - PDF ${pdfIndex + 1}`,
                  content: summarizedContent,
                  url: pdfUrl,
                },
              });
              console.log(
                `Data saved to database for PDF ${
                  pdfIndex + 1
                } of row ${index}.`
              );
            } catch (pdfError) {
              console.error(
                `Error processing PDF ${pdfIndex + 1} for row ${index}:`,
                pdfError
              );
            }
          }
        } catch (rowError) {
          console.error(`Error processing row ${index}:`, rowError);
        }
      }

      console.log(`Scraping completed.`);
      return "Successfully scraped data";
    } catch (error) {
      console.error("Error scraping data:", error);
      throw new Error("Failed to scrape data");
    }
  }

  async savePDFDataOJK() {
    try {
      const mainUrl = "https://www.ojk.go.id/id/Regulasi/Default.aspx";
      console.log(`Starting to scrape data from: ${mainUrl}`);

      const response = await axios.get(mainUrl);
      const $ = cheerio.load(response.data);

      console.log(`Successfully fetched main page. Parsing rows...`);

      const rows = $("tr");
      for (let index = 0; index < rows.length; index++) {
        try {
          console.log(`Processing row index: ${index}`);
          const element = rows[index];
          const row = $(element);
          const title = row.find("td").eq(1).text().trim();
          const relativeUrl = row.find("td").eq(1).find("a").attr("href");

          if (!relativeUrl) {
            console.log(`Skipping row ${index} due to missing PDF link.`);
            continue;
          }

          const detailUrl = new URL(
            relativeUrl,
            "https://www.ojk.go.id"
          ).toString();
          // console.log(`Detail page URL for row ${index}: ${detailUrl}`);

          const detailResponse = await axios.get(detailUrl);
          const detailPage = cheerio.load(detailResponse.data);

          const pdfLinks = detailPage("a")
            .filter((_, el) => $(el).attr("href")?.endsWith(".pdf"))
            .map((_, el) =>
              new URL($(el).attr("href")!, "https://www.ojk.go.id").toString()
            )
            .get();

          const pdfName = detailPage("a").text().trim();

          console.log("PDF Name \n", pdfName);

          if (pdfLinks.length === 0) {
            // console.log(`No PDF links found for detail page: ${detailUrl}`);
            continue;
          }

          // console.log(
          //   `Found ${pdfLinks.length} PDF link(s) for row ${index}:`,
          //   pdfLinks
          // );

          for (const [pdfIndex, pdfUrl] of pdfLinks.entries()) {
            // console.log(
            //   `Processing PDF ${pdfIndex + 1} for row ${index}: ${pdfUrl}`
            // );

            try {
              // Ensure directory for downloads/ojk exists
              this.ensureDirectoryExists(`./downloads/ojk/${title}`);

              const sanitizedTitle = this.sanitizeFilename(pdfUrl);
              console.log(sanitizedTitle);

              const pdfPath = path.join(
                `./downloads/ojk/${title}`,
                sanitizedTitle
              );
              // console.log(`Downloading PDF to: ${pdfPath}`);

              const pdfResponse = await axios.get(pdfUrl, {
                responseType: "stream", // Ensures the file is streamed, not parsed
              });

              // Stream the PDF file to the destination folder
              await new Promise((resolve, reject) => {
                pdfResponse.data
                  .pipe(fs.createWriteStream(pdfPath))
                  .on("finish", resolve)
                  .on("error", reject);
              });

              // console.log(
              //   `PDF ${pdfIndex + 1} downloaded successfully at: ${pdfPath}`
              // );
            } catch (pdfError) {
              console.error(
                `Error downloading PDF ${pdfIndex + 1} for row ${index}:`,
                pdfError
              );
            }
          }
        } catch (rowError) {
          console.error(`Error processing row ${index}:`, rowError);
        }
      }

      console.log(`Scraping completed.`);
      return "Successfully scraped and saved PDFs";
    } catch (error) {
      console.error("Error scraping data:", error);
      throw new Error("Failed to scrape and save PDFs");
    }
  }

  async savePDFDataKemenkeu() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox"],
      headless: true, // Set to true for headless mode
      executablePath:
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });

    const page = await browser.newPage();
    console.log("Browser launched.");

    try {
      console.log("Navigating to the website...");
      const web = await page.goto(
        "https://setpp.kemenkeu.go.id/risalah/indexPutusan",
        {
          waitUntil: "networkidle2",
        }
      );
      console.log("Website loaded successfully.");
      console.log(web);

      console.log("Waiting for table rows to load...");
      await page.waitForSelector("table tbody tr");
      console.log("Table rows found.");

      console.log("Extracting data from the table...");
      const data = await page.evaluate(() => {
        const rows = document.querySelectorAll("table tbody tr");
        const extractedData: any[] = [];

        rows.forEach((row) => {
          const noputElement = row.querySelector("td:nth-child(1) a");
          const noputText = noputElement
            ? noputElement.textContent?.trim()
            : null;
          const noputHref = noputElement
            ? noputElement.getAttribute("href")
            : null;
          const abstraksi = row
            .querySelector("td:nth-child(2)")
            ?.textContent?.trim();

          if (noputText && noputHref && abstraksi) {
            extractedData.push({
              noputText,
              noputHref,
              abstraksi,
            });
          }
        });

        return extractedData;
      });

      console.log("Data extracted:", data);

      console.log("Ensuring the downloads directory exists...");
      const outputPath = "./downloads/kemenkeu.json";
      if (!fs.existsSync("./downloads")) {
        fs.mkdirSync("./downloads");
        console.log("Created downloads directory.");
      } else {
        console.log("Downloads directory already exists.");
      }

      console.log("Saving data to a JSON file...");
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
      console.log(`Data successfully saved to "${outputPath}"`);
    } catch (error) {
      console.error("Error during scraping:", error);
    } finally {
      console.log("Closing browser...");
      await browser.close();
      console.log("Browser closed.");
    }
  }

  async sendEmail(blog: any) {
    try {
      const users = await prisma.user.findMany({
        select: { email: true },
      });

      const emailRecipients = users.map((user) => user.email);

      if (!emailRecipients.length) {
        console.warn("No recipients for the blog notification email.");
        return;
      }

      const emailMessage = {
        to: emailRecipients,
        from: "no-reply@yourblog.com",
        subject: `New OJK Update: ${blog.title}`,
        html: `
          <h1>${blog.title}</h1>
          <p>${blog.summary}</p>
          <a href="${blog.link}" target="_blank">Read more</a>
        `,
      };

      await this.transporter.sendMail(emailMessage);
      console.log("Email sent successfully.");
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Unable to send email notification");
    }
  }
}
