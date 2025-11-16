import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../config/db.js';

const mockResponse = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

test('getUserProfile reuses request user payload without hitting the database', async () => {
  const { getUserProfile } = await import('../controllers/userController.js');
  const reqUser = {
    id: 'user_123',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    profilePicture: 'https://example.com/avatar.png',
    phone: '+15551212',
    addresses: [{ id: 'addr_1', label: 'Home' }],
    role: 'CUSTOMER',
    preferences: { theme: 'dark' },
    lastLogin: new Date('2024-01-01T00:00:00Z'),
    createdAt: new Date('2023-12-12T00:00:00Z'),
  };

  const req = { user: reqUser };
  const res = mockResponse();

  const originalFindUnique = prisma.user.findUnique;
  let findUniqueCalled = false;
  prisma.user.findUnique = () => {
    findUniqueCalled = true;
    throw new Error('findUnique should not be called when req.user is present');
  };

  try {
    await getUserProfile(req, res);
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }

  assert.equal(findUniqueCalled, false);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    user: {
      id: reqUser.id,
      email: reqUser.email,
      name: 'Test User',
      firstName: reqUser.firstName,
      lastName: reqUser.lastName,
      profilePicture: reqUser.profilePicture,
      phone: reqUser.phone,
      addresses: reqUser.addresses,
      role: reqUser.role,
      preferences: reqUser.preferences,
      lastLogin: reqUser.lastLogin,
      createdAt: reqUser.createdAt,
    },
  });
});

test('getUserProfile returns 401 when middleware did not attach a user', async () => {
  const { getUserProfile } = await import('../controllers/userController.js');
  const req = { user: null };
  const res = mockResponse();

  await getUserProfile(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    message: 'Authentication required',
  });
});
