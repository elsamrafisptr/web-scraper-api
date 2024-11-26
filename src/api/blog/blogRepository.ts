import type { Prisma } from "@prisma/client";
import prisma from "@/common/utils/prismaClient";

export class BlogRepository {
  async createBlog(data: Prisma.BlogCreateInput) {
    try {
      const blog = await prisma.blog.create({
        data,
        select: {
          title: true,
          content: true,
          image: true,
          published: true,
          url: true,
        },
      });
      return blog;
    } catch (error) {
      console.error("Error creating blog:", error);
      throw new Error("Unable to create blog");
    }
  }

  async updateBlog(id: number, data: Prisma.BlogUpdateInput) {
    try {
      const blog = await prisma.blog.update({
        data,
        where: {
          id: id,
        },
        select: {
          title: true,
          content: true,
          image: true,
          published: true,
          url: true,
        },
      });

      if (!blog) {
        throw new Error("Blog not found");
      }

      return blog;
    } catch (error) {
      console.error("Error updating blog:", error);
      throw new Error("Unable to create blog");
    }
  }

  async deleteBlog(id: number) {
    try {
      const blog = await prisma.blog.delete({
        where: {
          id: id,
        },
        select: {
          title: true,
          content: true,
          image: true,
          published: true,
          url: true,
        },
      });

      if (!blog) {
        throw new Error("Blog not found");
      }

      return "Blog has been deleted";
    } catch (error) {
      console.error("Error updating blog:", error);
      throw new Error("Unable to create blog");
    }
  }

  async findAllBlogs() {
    try {
      const blogs = await prisma.blog.findMany({
        select: {
          id: true,
          title: true,
          content: true,
          image: true,
          published: true,
          url: true,
        },
        orderBy: {
          id: "asc",
        },
      });
      return blogs;
    } catch (error) {
      console.error("Error fetching blogs:", error);
      throw new Error("Unable to retrieve blogs");
    }
  }

  async findBlogById(id: number) {
    try {
      const blog = await prisma.blog.findUnique({
        where: {
          id,
        },
        select: {
          title: true,
          content: true,
          image: true,
          published: true,
          url: true,
        },
      });
      if (!blog) {
        throw new Error("Blog not found");
      }
      return blog;
    } catch (error) {
      console.error(`Error finding blog with id ${id}:`, error);
      throw new Error("Unable to retrieve blog");
    }
  }
}
