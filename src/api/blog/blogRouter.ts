import { Router } from "express";
import { BlogController } from "./blogController";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";

export const blogRegistry = new OpenAPIRegistry();
const blogRouter: Router = Router();
const blogController = new BlogController();

// Validation Schemas
const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "ID must be a number"),
});

const blogDataSchema = z.object({
  title: z.string().min(3),
  url: z.string().url(),
  content: z.string().optional(),
  image: z.string().url().optional(),
  published: z.string().optional(),
});

blogRegistry.register("Blog", blogDataSchema);

blogRouter.post("/scrape", blogController.scrapeData.bind(blogController));

blogRouter.post(
  "/scrape/ojk",
  blogController.scrapeDataOJK.bind(blogController)
);

blogRouter.get(
  "/download/ojk",
  blogController.downloadDataOJK.bind(blogController)
);

blogRouter.get(
  "/download/kemenkeu",
  blogController.downloadDataKemenkeu.bind(blogController)
);

blogRouter.get("/", blogController.getAllBlogs.bind(blogController));
blogRegistry.registerPath({
  method: "get",
  path: "/blogs",
  tags: ["Blog"],
  responses: createApiResponse(z.array(blogDataSchema), "Success"),
});

blogRouter.get(
  "/:id",
  async (req, res, next) => {
    try {
      const parsedParams = idParamSchema.parse(req.params);
      req.params.id = parsedParams.id;
      next();
    } catch (error) {
      res.status(400).json({ error: "Invalid ID format" });
    }
  },
  blogController.getBlogById.bind(blogController)
);

blogRegistry.registerPath({
  method: "get",
  path: "/blogs/:id",
  tags: ["Blog"],
  responses: createApiResponse(z.array(blogDataSchema), "Success"),
});

blogRouter.post(
  "/",
  async (req, res, next) => {
    try {
      const parsedBody = blogDataSchema.parse(req.body);
      req.body = parsedBody;
      next();
    } catch (error) {
      res.status(400).json({ error: "Invalid data" });
    }
  },
  blogController.createBlog.bind(blogController)
);

blogRegistry.registerPath({
  method: "post",
  path: "/blogs",
  tags: ["Blog"],
  responses: createApiResponse(z.array(blogDataSchema), "Success"),
});

blogRouter.put(
  "/:id",
  async (req, res, next) => {
    try {
      const parsedParams = idParamSchema.parse(req.params);
      req.params.id = parsedParams.id;
      blogDataSchema.partial().parse(req.body);
      next();
    } catch (error) {
      res.status(400).json({ error: "Invalid data" });
    }
  },
  blogController.updateBlog.bind(blogController)
);

blogRegistry.registerPath({
  method: "put",
  path: "/blogs/:id",
  tags: ["Blog"],
  responses: createApiResponse(z.array(blogDataSchema), "Success"),
});

blogRouter.delete(
  "/:id",
  async (req, res, next) => {
    try {
      const parsedParams = idParamSchema.parse(req.params);
      req.params.id = parsedParams.id;
      next();
    } catch (error) {
      res.status(400).json({ error: "Invalid ID format" });
    }
  },
  blogController.deleteBlog.bind(blogController)
);

blogRegistry.registerPath({
  method: "delete",
  path: "/blogs/:id",
  tags: ["Blog"],
  responses: createApiResponse(z.array(blogDataSchema), "Success"),
});

blogRouter.post(
  "/send-email/:blogId",
  blogController.sendEmailNotification.bind(blogController)
);

export default blogRouter;
