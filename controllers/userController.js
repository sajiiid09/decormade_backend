import User from '../models/User.js';
import Order from '../models/Order.js';
import { asyncHandler, generateToken } from '../middleware/authMiddleware.js';
import {
  googleAuth,
  googleCallback,
  handleGoogleAuth,
  logout,
  getCurrentUser
} from '../middleware/passportConfig.js';

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getUserProfile = getCurrentUser;

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateUserProfile = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    preferences
  } = req.body;

  const updateData = {};
  
  if (name) {
    updateData['name.firstName'] = name.firstName;
    updateData['name.lastName'] = name.lastName;
  }
  
  if (phone) {
    updateData.phone = phone;
  }
  
  if (preferences) {
    updateData.preferences = { ...req.user.preferences, ...preferences };
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updateData,
    { new: true, runValidators: true }
  ).select('-__v');

  res.json({
    success: true,
    data: user,
    message: 'Profile updated successfully'
  });
});

// @desc    Add user address
// @route   POST /api/users/addresses
// @access  Private
export const addUserAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  await user.addAddress(req.body);
  
  res.status(201).json({
    success: true,
    data: user.addresses,
    message: 'Address added successfully'
  });
});

// @desc    Update user address
// @route   PUT /api/users/addresses/:addressId
// @access  Private
export const updateUserAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  try {
    await user.updateAddress(req.params.addressId, req.body);
    
    res.json({
      success: true,
      data: user.addresses,
      message: 'Address updated successfully'
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Delete user address
// @route   DELETE /api/users/addresses/:addressId
// @access  Private
export const deleteUserAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  try {
    await user.removeAddress(req.params.addressId);
    
    res.json({
      success: true,
      data: user.addresses,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get user orders summary
// @route   GET /api/users/orders-summary
// @access  Private
export const getUserOrdersSummary = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .select('status payment.status pricing.total createdAt')
    .sort({ createdAt: -1 })
    .limit(10);

  const summary = await Order.aggregate([
    { $match: { user: req.user._id } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$pricing.total' },
        pendingOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        completedOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        }
      }
    }
  ]);

  const result = summary[0] || {
    totalOrders: 0,
    totalSpent: 0,
    pendingOrders: 0,
    completedOrders: 0
  };

  res.json({
    success: true,
    data: {
      summary: result,
      recentOrders: orders
    }
  });
});

// @desc    Get all users (Admin)
// @route   GET /api/users/admin/all
// @access  Private/Admin
export const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    role,
    search,
    isActive
  } = req.query;

  const filter = {};
  
  if (role) {
    filter.role = role;
  }
  
  if (isActive !== undefined) {
    filter.isActive = isActive === 'true';
  }
  
  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { 'name.firstName': { $regex: search, $options: 'i' } },
      { 'name.lastName': { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const users = await User.find(filter)
    .select('-__v')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const total = await User.countDocuments(filter);

  res.json({
    success: true,
    data: users,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      totalUsers: total,
      hasNext: skip + users.length < total,
      hasPrev: Number(page) > 1
    }
  });
});

// @desc    Get user by ID (Admin)
// @route   GET /api/users/admin/:id
// @access  Private/Admin
export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-__v');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Get user's orders
  const orders = await Order.find({ user: user._id })
    .select('orderNumber status pricing.total createdAt')
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    success: true,
    data: {
      user,
      recentOrders: orders
    }
  });
});

// @desc    Update user (Admin)
// @route   PUT /api/users/admin/:id
// @access  Private/Admin
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).select('-__v');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: user,
    message: 'User updated successfully'
  });
});

// @desc    Delete user (Admin)
// @route   DELETE /api/users/admin/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Get user statistics (Admin)
// @route   GET /api/users/admin/stats
// @access  Private/Admin
export const getUserStats = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;
  
  let startDate;
  switch (period) {
    case '7d':
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const stats = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
        },
        adminUsers: {
          $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
        },
        customerUsers: {
          $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] }
        }
      }
    }
  ]);

  const result = stats[0] || {
    totalUsers: 0,
    activeUsers: 0,
    adminUsers: 0,
    customerUsers: 0
  };

  res.json({
    success: true,
    data: result
  });
});

// Export Google OAuth handlers
export { googleAuth, googleCallback, handleGoogleAuth, logout };
