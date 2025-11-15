import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/authMiddleware.js';

const reviewInclude = {
  include: {
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        profilePicture: true,
      },
    },
  },
};

const productInclude = {
  reviews: reviewInclude,
};

const mapSortField = (sort) => {
  switch (sort) {
    case 'price':
      return 'price';
    case 'rating.average':
      return 'ratingAverage';
    case 'rating.count':
      return 'ratingCount';
    case 'createdAt':
    default:
      return 'createdAt';
  }
};

const refreshProductRating = async (productId) => {
  const stats = await prisma.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAverage: stats._avg.rating || 0,
      ratingCount: stats._count.rating,
    },
  });
};

export const getProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    category,
    minPrice,
    maxPrice,
    search,
    sort = 'createdAt',
    order = 'desc',
    featured,
    active = 'true',
  } = req.query;

  const where = {
    isActive: active === 'true',
  };

  if (category) {
    where.category = category;
  }

  if (featured === 'true') {
    where.isFeatured = true;
  }

  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = new Prisma.Decimal(minPrice);
    if (maxPrice) where.price.lte = new Prisma.Decimal(maxPrice);
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { category: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const orderBy = {
    [mapSortField(sort)]: order === 'asc' ? 'asc' : 'desc',
  };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take: Number(limit),
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  res.json({
    success: true,
    data: products,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
      totalProducts: total,
      hasNext: skip + products.length < total,
      hasPrev: Number(page) > 1,
    },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: productInclude,
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found',
    });
  }

  res.json({
    success: true,
    data: product,
  });
});

export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    category,
    price,
    stock,
    images,
    isActive,
    isFeatured,
  } = req.body;

  const product = await prisma.product.create({
    data: {
      name,
      description,
      category,
      price: new Prisma.Decimal(price ?? 0),
      stock: Number(stock ?? 0),
      images: images ?? [],
      isActive: isActive ?? true,
      isFeatured: isFeatured ?? false,
    },
    include: productInclude,
  });

  res.status(201).json({
    success: true,
    data: product,
    message: 'Product created successfully',
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.price !== undefined) {
      data.price = new Prisma.Decimal(data.price);
    }
    if (data.stock !== undefined) {
      data.stock = Number(data.stock);
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: productInclude,
    });

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    throw error;
  }
});

export const deleteProduct = asyncHandler(async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }
    throw error;
  }
});

export const addProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const productId = req.params.id;

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found',
    });
  }

  const existingReview = await prisma.review.findFirst({
    where: {
      productId,
      userId: req.user.id,
    },
  });

  if (existingReview) {
    return res.status(400).json({
      success: false,
      message: 'You have already reviewed this product',
    });
  }

  const review = await prisma.review.create({
    data: {
      productId,
      userId: req.user.id,
      rating: Number(rating),
      comment: comment || '',
    },
    ...reviewInclude,
  });

  await refreshProductRating(productId);

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: review,
  });
});

export const updateProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const review = await prisma.review.findUnique({
    where: { id: req.params.reviewId },
  });

  if (!review || review.productId !== req.params.id) {
    return res.status(404).json({
      success: false,
      message: 'Review not found',
    });
  }

  if (review.userId !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this review',
    });
  }

  const updated = await prisma.review.update({
    where: { id: req.params.reviewId },
    data: {
      rating: Number(rating),
      comment: comment || '',
    },
    ...reviewInclude,
  });

  await refreshProductRating(review.productId);

  res.json({
    success: true,
    message: 'Review updated successfully',
    data: updated,
  });
});

export const deleteProductReview = asyncHandler(async (req, res) => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.reviewId },
  });

  if (!review || review.productId !== req.params.id) {
    return res.status(404).json({
      success: false,
      message: 'Review not found',
    });
  }

  if (review.userId !== req.user.id && req.user.role !== 'ADMIN' && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this review',
    });
  }

  await prisma.review.delete({ where: { id: req.params.reviewId } });
  await refreshProductRating(review.productId);

  res.json({
    success: true,
    message: 'Review deleted successfully',
  });
});

export const getProductCategories = asyncHandler(async (req, res) => {
  const categories = await prisma.product.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });

  res.json({
    success: true,
    data: categories.map(item => item.category),
  });
});

export const getFeaturedProducts = asyncHandler(async (req, res) => {
  const { limit = 8 } = req.query;

  const products = await prisma.product.findMany({
    where: {
      isFeatured: true,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
    take: Number(limit),
    include: productInclude,
  });

  res.json({
    success: true,
    data: products,
  });
});

export const getRelatedProducts = asyncHandler(async (req, res) => {
  const { limit = 4 } = req.query;
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found',
    });
  }

  const related = await prisma.product.findMany({
    where: {
      id: { not: product.id },
      category: product.category,
      isActive: true,
    },
    take: Number(limit),
    include: productInclude,
  });

  res.json({
    success: true,
    data: related,
  });
});
