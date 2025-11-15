import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import prisma from '../config/db.js';
import { generateToken } from './authMiddleware.js';

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Email is required for Google authentication'), null);
    }

    let user = await prisma.user.findFirst({
      where: { googleId: profile.id },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          loginCount: { increment: 1 },
          lastLogin: new Date(),
        },
      });
      return done(null, user);
    }

    user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.id,
          profilePicture: profile.photos?.[0]?.value || '',
          loginCount: { increment: 1 },
          lastLogin: new Date(),
        },
      });
      return done(null, user);
    }

    const newUser = await prisma.user.create({
      data: {
        googleId: profile.id,
        email,
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        profilePicture: profile.photos?.[0]?.value || '',
        loginCount: 1,
        lastLogin: new Date(),
      },
    });

    return done(null, newUser);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

export const googleCallback = passport.authenticate('google', {
  failureRedirect: (process.env.FRONTEND_URL || '') + '/login?error=auth_failed',
  session: false
});

export const handleGoogleAuth = async (req, res) => {
  try {
    const user = req.user;
    const token = generateToken(user.id);
    const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: user.id,
      email: user.email,
      name: displayName,
      profilePicture: user.profilePicture,
      role: user.role,
    }))}`;

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google auth handler error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
  }
};

export const logout = (req, res) => {
  req.logout(err => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
};

export const getCurrentUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { addresses: true },
    });
    const displayName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        phone: user.phone,
        addresses: user.addresses,
        role: user.role,
        preferences: user.preferences,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information'
    });
  }
};

export default passport;
