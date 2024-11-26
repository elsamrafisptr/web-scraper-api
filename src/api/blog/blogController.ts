import { Request, Response, NextFunction } from "express";
import { BlogService } from "./blogService";
import { Prisma } from "@prisma/client";

export class BlogController {
  private blogService: BlogService;

  constructor(blogService: BlogService = new BlogService()) {
    this.blogService = blogService;
  }

  async getAllBlogs(req: Request, res: Response, next: NextFunction) {
    try {
      const blogs = await this.blogService.findAll();
      return res.status(200).json(blogs);
    } catch (error) {
      next(error);
    }
  }

  async getBlogById(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
      const blogId = Number(id);
      if (isNaN(blogId)) {
        return res.status(400).json({ error: "Invalid blog ID format" });
      }

      const blog = await this.blogService.findById(blogId);
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      return res.status(200).json(blog);
    } catch (error) {
      next(error);
    }
  }

  async createBlog(req: Request, res: Response, next: NextFunction) {
    try {
      const blogData: Prisma.BlogCreateInput = req.body;
      const blog = await this.blogService.create(blogData);
      return res.status(201).json(blog);
    } catch (error) {
      next(error);
    }
  }

  async updateBlog(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
      const blogId = Number(id);
      if (isNaN(blogId)) {
        return res.status(400).json({ error: "Invalid blog ID format" });
      }

      const blogData: Prisma.BlogUpdateInput = req.body;
      const updatedBlog = await this.blogService.update(blogId, blogData);
      return res.status(200).json(updatedBlog);
    } catch (error) {
      next(error);
    }
  }

  async deleteBlog(req: Request, res: Response, next: NextFunction) {
    const { id } = req.params;
    try {
      const blogId = Number(id);
      if (isNaN(blogId)) {
        return res.status(400).json({ error: "Invalid blog ID format" });
      }

      await this.blogService.delete(blogId);
      return res.status(200).json({ message: "Blog deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async scrapeData(req: Request, res: Response, next: NextFunction) {
    try {
      console.log("Scraping data...");
      const blogs = await this.blogService.scrapeData();
      return res.status(201).json(blogs);
    } catch (error) {
      //   next(error);
      console.error("Error scraping data:", error);
      return res
        .status(500)
        .json({ message: `error from controller: ${error}` });
    }
  }

  async scrapeDataOJK(req: Request, res: Response, next: NextFunction) {
    try {
      console.log("Scraping data ojk...");
      const blogs = await this.blogService.scrapeDataOJK();
      return res.status(201).json(blogs);
    } catch (error) {
      //   next(error);
      console.error("Error scraping data:", error);
      return res
        .status(500)
        .json({ message: `error from controller: ${error}` });
    }
  }

  async downloadDataOJK(req: Request, res: Response, next: NextFunction) {
    try {
      console.log("Downloading data ojk...");
      const blogs = await this.blogService.savePDFDataOJK();
      return res.status(201).json(blogs);
    } catch (error) {
      //   next(error);
      console.error("Error scraping data:", error);
      return res
        .status(500)
        .json({ message: `error from controller: ${error}` });
    }
  }

  async downloadDataKemenkeu(req: Request, res: Response, next: NextFunction) {
    try {
      console.log("Downloading data kemenkeu...");
      const blogs = await this.blogService.savePDFDataKemenkeu();
      return res.status(201).json(blogs);
    } catch (error) {
      //   next(error);
      console.error("Error scraping data:", error);
      return res
        .status(500)
        .json({ message: `error from controller: ${error}` });
    }
  }

  async sendEmailNotification(req: Request, res: Response, next: NextFunction) {
    const { blogId } = req.params;
    try {
      const blog = await this.blogService.findById(Number(blogId));
      if (!blog) {
        return res.status(404).json({ error: "Blog not found" });
      }

      await this.blogService.sendEmail({
        title: blog.title,
        summary: blog.content,
        link: blog.url,
      });

      return res
        .status(200)
        .json({ message: "Email notification sent successfully" });
    } catch (error) {
      next(error);
    }
  }
}
