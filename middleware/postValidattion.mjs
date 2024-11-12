export const validatePost = (req, res, next) => {
  const { title, image, category_id, description, content, status_id } =
    req.body;

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }
  if (!image) {
    return res.status(400).json({ message: "Image is required" });
  }
  if (!category_id) {
    return res.status(400).json({ message: "Category Id is required" });
  }
  if (!description) {
    return res.status(400).json({ message: "Description is required" });
  }
  if (!content) {
    return res.status(400).json({ message: "Content is required" });
  }
  if (!status_id) {
    return res.status(400).json({ message: "Status Id is required" });
  }

  if (typeof title !== "string") {
    return res.status(400).json({ message: "Title must be a string" });
  }
  if (typeof image !== "string") {
    return res.status(400).json({ message: "Image must be a string" });
  }
  if (typeof category_id !== "number") {
    return res.status(400).json({ message: "Category Id must be a number" });
  }
  if (typeof description !== "string") {
    return res.status(400).json({ message: "Description must be a string" });
  }
  if (typeof content !== "string") {
    return res.status(400).json({ message: "Content must be a string" });
  }
  if (typeof status_id !== "number") {
    return res.status(400).json({ message: "Status Id must be a number" });
  }

  next();
};
