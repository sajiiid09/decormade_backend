import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/authMiddleware.js';
import {
  googleAuth,
  googleCallback,
  handleGoogleAuth,
  logout,
  getCurrentUser,
} from '../middleware/passportConfig.js';

export const getUserProfile = getCurrentUser;

export const updateUserProfile = asyncHandler(async (req, res) => {
  const { name, phone, preferences } = req.body;

  const data = {};
  if (name) {
    data.firstName = name.firstName;
    data.lastName = name.lastName;
  }
  if (phone !== undefined) {
    data.phone = phone;
  }
  if (preferences) {
    data.preferences = {
      ...(req.user.preferences || {}),
      ...preferences,
    };
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    include: { addresses: true },
  });

  res.json({
    success: true,
    data: user,
    message: 'Profile updated successfully',
  });
});

export const addUserAddress = asyncHandler(async (req, res) => {
  await prisma.userAddress.create({
    data: {
      userId: req.user.id,
      label: req.body.label || 'Other',
      type: req.body.type || 'shipping',
      phone: req.body.phone || null,
      isDefault: req.body.isDefault ?? false,
      data: req.body,
    },
  });

  const addresses = await prisma.userAddress.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });

  res.status(201).json({
    success: true,
    data: addresses,
    message: 'Address added successfully',
  });
});

export const updateUserAddress = asyncHandler(async (req, res) => {
  const address = await prisma.userAddress.findUnique({
    where: { id: req.params.addressId },
  });

  if (!address || address.userId !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Address not found',
    });
  }

  await prisma.userAddress.update({
    where: { id: req.params.addressId },
    data: {
      label: req.body.label ?? address.label,
      type: req.body.type ?? address.type,
      phone: req.body.phone ?? address.phone,
      isDefault: req.body.isDefault ?? address.isDefault,
      data: req.body,
    },
  });

  const addresses = await prisma.userAddress.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: addresses,
    message: 'Address updated successfully',
  });
});

export const deleteUserAddress = asyncHandler(async (req, res) => {
  const address = await prisma.userAddress.findUnique({
    where: { id: req.params.addressId },
  });

  if (!address || address.userId !== req.user.id) {
    return res.status(404).json({
      success: false,
      message: 'Address not found',
    });
  }

  await prisma.userAddress.delete({ where: { id: req.params.addressId } });

  const addresses = await prisma.userAddress.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: addresses,
    message: 'Address deleted successfully',
  });
});

export const getUserOrdersSummary = asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const summary = await prisma.order.aggregate({
    where: { userId: req.user.id },
    _count: { _all: true },
    _sum: { total: true },
  });

  const pendingOrders = await prisma.order.count({ where: { userId: req.user.id, status: 'pending' } });
  const completedOrders = await prisma.order.count({ where: { userId: req.user.id, status: 'delivered' } });

  res.json({
    success: true,
    data: {
      summary: {
        totalOrders: summary._count._all,
        totalSpent: summary._sum.total || 0,
        pendingOrders,
        completedOrders,
      },
      recentOrders: orders,
    },
  });
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    role,
    search,
    isActive,
  } = req.query;

  const where = {};
  if (role) where.role = role === 'admin' ? 'ADMIN' : role === 'customer' ? 'CUSTOMER' : role;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      include: { addresses: true },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    data: users,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
      totalUsers: total,
      hasNext: skip + users.length < total,
      hasPrev: Number(page) > 1,
    },
  });
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      addresses: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
        },
      },
    },
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  res.json({
    success: true,
    data: user,
  });
});

export const updateUser = asyncHandler(async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      include: { addresses: true },
    });

    res.json({
      success: true,
      data: user,
      message: 'User updated successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    throw error;
  }
});

export const deleteUser = asyncHandler(async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }
    throw error;
  }
});

export const getUserStats = asyncHandler(async (req, res) => {
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

  const [totalUsers, activeUsers, adminUsers, customerUsers] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: startDate } } }),
    prisma.user.count({ where: { createdAt: { gte: startDate }, isActive: true } }),
    prisma.user.count({ where: { createdAt: { gte: startDate }, role: 'ADMIN' } }),
    prisma.user.count({ where: { createdAt: { gte: startDate }, role: 'CUSTOMER' } }),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      activeUsers,
      adminUsers,
      customerUsers,
    },
  });
});

export { googleAuth, googleCallback, handleGoogleAuth, logout };
