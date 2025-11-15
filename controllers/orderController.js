import { Prisma } from '@prisma/client';
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/authMiddleware.js';

const orderInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          images: true,
          price: true,
        },
      },
    },
  },
};

const decimal = (value = 0) => new Prisma.Decimal(value);

const generateOrderNumber = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

const buildDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return undefined;
  const range = {};
  if (startDate) range.gte = new Date(startDate);
  if (endDate) range.lte = new Date(endDate);
  return range;
};

export const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    shippingAddress,
    billingAddress,
    paymentMethod,
    notes,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Order must contain at least one item',
    });
  }

  const productIds = items.map(item => item.product);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  if (products.length !== items.length) {
    return res.status(400).json({
      success: false,
      message: 'One or more products were not found',
    });
  }

  const productMap = new Map(products.map(p => [p.id, p]));

  let subtotal = 0;
  const orderItemsData = [];

  for (const item of items) {
    const product = productMap.get(item.product);
    if (!product) {
      return res.status(400).json({
        success: false,
        message: `Product not found: ${item.product}`,
      });
    }

    if (product.stock < item.quantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
      });
    }

    const itemTotal = Number(product.price) * Number(item.quantity);
    subtotal += itemTotal;

    orderItemsData.push({
      productId: product.id,
      quantity: Number(item.quantity),
      price: decimal(product.price),
      total: decimal(itemTotal),
    });
  }

  const shippingCost = subtotal > 1000 ? 0 : 100;
  const tax = subtotal * 0.05;
  const total = subtotal + shippingCost + tax;

  const order = await prisma.$transaction(async tx => {
    const createdOrder = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: req.user.id,
        shippingAddress: shippingAddress || {},
        billingAddress: billingAddress || shippingAddress || {},
        paymentMethod,
        paymentStatus: 'pending',
        customerNote: notes?.customer || '',
        adminNote: notes?.admin || '',
        subtotal: decimal(subtotal),
        shippingCost: decimal(shippingCost),
        tax: decimal(tax),
        total: decimal(total),
        items: {
          create: orderItemsData,
        },
      },
      include: orderInclude,
    });

    for (const item of orderItemsData) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
        },
      });
    }

    return createdOrder;
  });

  res.status(201).json({
    success: true,
    data: order,
    message: 'Order created successfully',
  });
});

export const getUserOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    paymentStatus,
  } = req.query;

  const where = { userId: req.user.id };
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: orderInclude,
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
      totalOrders: total,
      hasNext: skip + orders.length < total,
      hasPrev: Number(page) > 1,
    },
  });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: orderInclude,
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found',
    });
  }

  if (order.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this order',
    });
  }

  res.json({
    success: true,
    data: order,
  });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status,
        adminNote: note ?? undefined,
        deliveredAt: status === 'delivered' ? new Date() : undefined,
      },
      include: orderInclude,
    });

    res.json({
      success: true,
      data: order,
      message: 'Order status updated successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }
    throw error;
  }
});

export const addShippingInfo = asyncHandler(async (req, res) => {
  const { trackingNumber, carrier, estimatedDelivery } = req.body;

  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        trackingNumber,
        carrier,
        estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
      },
      include: orderInclude,
    });

    res.json({
      success: true,
      data: order,
      message: 'Shipping information added successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }
    throw error;
  }
});

export const markOrderDelivered = asyncHandler(async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status: 'delivered',
        paymentStatus: 'paid',
        deliveredAt: new Date(),
      },
      include: orderInclude,
    });

    res.json({
      success: true,
      data: order,
      message: 'Order marked as delivered',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }
    throw error;
  }
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: true,
    },
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found',
    });
  }

  if (order.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this order',
    });
  }

  if (['delivered', 'cancelled'].includes(order.status)) {
    return res.status(400).json({
      success: false,
      message: 'Order cannot be cancelled',
    });
  }

  const updated = await prisma.$transaction(async tx => {
    const cancelledOrder = await tx.order.update({
      where: { id: req.params.id },
      data: {
        status: 'cancelled',
        paymentStatus: 'refunded',
        cancelledAt: new Date(),
        cancellationReason: reason || '',
      },
      include: orderInclude,
    });

    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
        },
      });
    }

    return cancelledOrder;
  });

  res.json({
    success: true,
    data: updated,
    message: 'Order cancelled successfully',
  });
});

export const getAllOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    paymentStatus,
    startDate,
    endDate,
    search,
  } = req.query;

  const where = {};
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  const dateRange = buildDateRange(startDate, endDate);
  if (dateRange) where.createdAt = dateRange;

  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: orderInclude,
    }),
    prisma.order.count({ where }),
  ]);

  res.json({
    success: true,
    data: orders,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
      totalOrders: total,
      hasNext: skip + orders.length < total,
      hasPrev: Number(page) > 1,
    },
  });
});

export const getOrderStats = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  let startDate;
  switch (period) {
    case '7d':
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const [aggregate, pendingOrders, completedOrders] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: startDate } },
      _count: { _all: true },
      _sum: { total: true },
      _avg: { total: true },
    }),
    prisma.order.count({ where: { createdAt: { gte: startDate }, status: 'pending' } }),
    prisma.order.count({ where: { createdAt: { gte: startDate }, status: 'delivered' } }),
  ]);

  res.json({
    success: true,
    data: {
      totalOrders: aggregate._count._all,
      totalRevenue: aggregate._sum.total || 0,
      averageOrderValue: aggregate._avg.total || 0,
      pendingOrders,
      completedOrders,
    },
  });
});

