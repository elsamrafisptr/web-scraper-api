import cron from "node-cron";
import { BlogService } from "../api/blog/blogService"; // example import, adjust for your project

const blogService = new BlogService();

export const startScheduledJobs = () => {
  cron.schedule("*/2 * * * *", async () => {
    console.log("Running scheduled scrape data job every 2 minutes");

    try {
      const scrapedData = await blogService.scrapeData();
      console.log("Scraped data successfully:", scrapedData);
    } catch (error) {
      console.error("Error in scheduled job:", error);
    }
  });
};
