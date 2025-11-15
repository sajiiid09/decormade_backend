# 🗄️ MongoDB → PostgreSQL (NeonDB) + Prisma Migration Audit

**Date:** Generated  
**Stack:** Next.js + PostgreSQL (NeonDB) + Prisma ORM + Inngest (planned)

---

## 📋 Executive Summary

Your backend is in a **hybrid state**: 
- ✅ `config/db.js` already uses PostgreSQL connection (`pg`)
- ❌ Controllers still use Mongoose methods (referencing non-existent models)
- ❌ `package.json` still includes `mongoose` dependency
- ❌ Documentation still references MongoDB

**Migration Status:** ~20% complete (connection layer only)

---

## 🧩 1. File & Folder Categorization

### ✅ **KEEP** (No Changes Needed)

These files are database-agnostic and can remain as-is:

```
backend/
├── routes/
│   ├── productRoutes.js          ✅ Pure Express routing
│   ├── orderRoutes.js            ✅ Pure Express routing
│   ├── userRoutes.js             ✅ Pure Express routing
│   └── paymentRoutes.js           ✅ Placeholder routes (Stripe integration)
├── middleware/
│   ├── authMiddleware.js          ✅ JWT logic (needs minor Prisma import)
│   └── passportConfig.js          ✅ OAuth logic (needs Prisma import)
├── server.js                      ✅ Express server setup
├── package.json                   ✅ Dependencies list (needs cleanup)
├── README.md                      ✅ Documentation (needs update)
├── DEPLOYMENT.md                  ✅ Deployment guide (needs update)
└── render.yaml                    ✅ Deployment config
```

**Reasoning:** Routes are pure Express middleware chains. Middleware handles authentication/authorization logic that works with any ORM.

---

### 🛠️ **MODIFY** (Required Changes)

These files need updates to work with Prisma:

#### **1. `/config/db.js`** ⚠️ **HIGH PRIORITY**
**Current State:**
- Uses PostgreSQL `Pool` connection
- Exports `pool` directly
- Environment variables: `PG_USER`, `PG_HOST`, `PG_DATABASE`, `PG_PASSWORD`, `PG_PORT`

**Required Changes:**
- Replace with Prisma Client initialization
- Use NeonDB connection string format: `DATABASE_URL`
- Handle connection pooling via Prisma
- Remove direct `pg` Pool usage

**New Structure:**
```javascript
// config/db.js → src/lib/db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // NeonDB connection string
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
```

**Environment Variables to Change:**
- ❌ Remove: `PG_USER`, `PG_HOST`, `PG_DATABASE`, `PG_PASSWORD`, `PG_PORT`
- ✅ Add: `DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require`

---

#### **2. `/controllers/productController.js`** ⚠️ **HIGH PRIORITY**

**Current Mongoose Patterns → Prisma Equivalents:**

| Mongoose | Prisma |
|----------|--------|
| `Product.find(filter)` | `prisma.product.findMany({ where: filter })` |
| `Product.findById(id)` | `prisma.product.findUnique({ where: { id } })` |
| `Product.findByIdAndUpdate()` | `prisma.product.update({ where: { id }, data })` |
| `Product.findByIdAndDelete()` | `prisma.product.delete({ where: { id } })` |
| `Product.countDocuments(filter)` | `prisma.product.count({ where: filter })` |
| `Product.distinct('category')` | `prisma.product.findMany({ select: { category: true }, distinct: ['category'] })` |
| `.populate('reviews.user')` | Use Prisma `include` or nested queries |
| `.sort()`, `.skip()`, `.limit()` | `orderBy`, `skip`, `take` in Prisma |

**Key Changes Needed:**

1. **Replace Import:**
   ```javascript
   // OLD
   import Product from '../models/Product.js';
   
   // NEW
   import prisma from '../lib/db.js';
   ```

2. **Query Transformations:**
   - `filter.$text = { $search: search }` → Use Prisma `contains` or full-text search
   - `filter.price.$gte` → `price: { gte: Number(minPrice) }`
   - `product.reviews.push(review)` → `prisma.review.create({ data: { ... } })`
   - `product.reviews.id(reviewId)` → Direct Prisma query on `Review` model

3. **Nested Operations:**
   - Reviews embedded in Product → Separate `Review` table with `productId` foreign key
   - Use Prisma relations: `include: { reviews: { include: { user: true } } }`

---

#### **3. `/controllers/userController.js`** ⚠️ **HIGH PRIORITY**

**Current Mongoose Patterns → Prisma Equivalents:**

| Mongoose | Prisma |
|----------|--------|
| `User.findById(id)` | `prisma.user.findUnique({ where: { id } })` |
| `User.findByIdAndUpdate()` | `prisma.user.update({ where: { id }, data })` |
| `User.findByIdAndDelete()` | `prisma.user.delete({ where: { id } })` |
| `User.find()` with filters | `prisma.user.findMany({ where: filter })` |
| `User.countDocuments()` | `prisma.user.count({ where: filter })` |
| `User.aggregate([...])` | Prisma `groupBy` or raw SQL queries |
| `user.addAddress()` | `prisma.address.create({ data: { userId, ... } })` |
| `user.updateAddress()` | `prisma.address.update({ where: { id }, data })` |
| `user.removeAddress()` | `prisma.address.delete({ where: { id } })` |

**Key Changes Needed:**

1. **Replace Import:**
   ```javascript
   // OLD
   import User from '../models/User.js';
   
   // NEW
   import prisma from '../lib/db.js';
   ```

2. **Aggregation Queries:**
   - `User.aggregate([...])` → Use Prisma `groupBy` or `$queryRaw` for complex aggregations
   - Example: `prisma.user.groupBy({ by: ['role'], _count: true })`

3. **Address Management:**
   - Embedded addresses → Separate `Address` table with `userId` foreign key
   - Replace `user.addAddress()` with direct Prisma queries

4. **Google OAuth:**
   - `User.findOne({ googleId })` → `prisma.user.findUnique({ where: { googleId } })`
   - `User.findOne({ email })` → `prisma.user.findUnique({ where: { email } })`

---

#### **4. `/controllers/orderController.js`** ⚠️ **HIGH PRIORITY**

**Current Mongoose Patterns → Prisma Equivalents:**

| Mongoose | Prisma |
|----------|--------|
| `Order.find(filter)` | `prisma.order.findMany({ where: filter })` |
| `Order.findById(id)` | `prisma.order.findUnique({ where: { id } })` |
| `new Order({...})` → `order.save()` | `prisma.order.create({ data: {...} })` |
| `Order.aggregate([...])` | Prisma `groupBy` or raw SQL |
| `order.updateStatus()` | `prisma.order.update({ where: { id }, data: { status } })` |
| `order.cancelOrder()` | `prisma.order.update({ where: { id }, data: { status: 'cancelled' } })` |
| `.populate('items.product')` | Use Prisma `include` relations |

**Key Changes Needed:**

1. **Replace Imports:**
   ```javascript
   // OLD
   import Order from '../models/Order.js';
   import Product from '../models/Product.js';
   
   // NEW
   import prisma from '../lib/db.js';
   ```

2. **Order Items:**
   - Embedded items array → Separate `OrderItem` table with `orderId` and `productId`
   - Use Prisma relations: `include: { items: { include: { product: true } } }`

3. **Stock Updates:**
   - `Product.findByIdAndUpdate(id, { $inc: { stock: -quantity } })` 
   - → `prisma.product.update({ where: { id }, data: { stock: { decrement: quantity } } })`

4. **Aggregations:**
   - Complex `Order.aggregate()` → Use Prisma `groupBy` or `$queryRaw` for statistics

---

#### **5. `/middleware/authMiddleware.js`** ⚠️ **MEDIUM PRIORITY**

**Current Issues:**
- Uses `User.findById(decoded.userId)` (Mongoose)
- References `user._id` (MongoDB ObjectId)

**Required Changes:**

1. **Replace Import:**
   ```javascript
   // OLD
   import User from '../models/User.js';
   
   // NEW
   import prisma from '../lib/db.js';
   ```

2. **Update Queries:**
   ```javascript
   // OLD
   const user = await User.findById(decoded.userId).select('-__v');
   
   // NEW
   const user = await prisma.user.findUnique({ 
     where: { id: decoded.userId } 
   });
   ```

3. **ID References:**
   - `user._id` → `user.id` (Prisma uses `id` by default, or `userId` if customized)
   - `req.user._id.toString()` → `req.user.id` (Prisma IDs are strings)

---

#### **6. `/middleware/passportConfig.js`** ⚠️ **MEDIUM PRIORITY**

**Required Changes:**

1. **Replace Import:**
   ```javascript
   // OLD
   import User from '../models/User.js';
   
   // NEW
   import prisma from '../lib/db.js';
   ```

2. **Update OAuth Queries:**
   ```javascript
   // OLD
   let user = await User.findOne({ googleId: profile.id });
   
   // NEW
   let user = await prisma.user.findUnique({ 
     where: { googleId: profile.id } 
   });
   ```

3. **Update User Creation:**
   ```javascript
   // OLD
   const newUser = new User({...});
   await newUser.save();
   
   // NEW
   const newUser = await prisma.user.create({ data: {...} });
   ```

4. **Update Serialization:**
   ```javascript
   // OLD
   passport.serializeUser((user, done) => {
     done(null, user._id);
   });
   
   // NEW
   passport.serializeUser((user, done) => {
     done(null, user.id); // Prisma uses 'id' instead of '_id'
   });
   ```

---

#### **7. `/server.js`** ⚠️ **LOW PRIORITY**

**Required Changes:**

1. **Update Comment:**
   ```javascript
   // OLD
   // Connect to MongoDB
   connectDB();
   
   // NEW
   // Initialize Prisma Client (connection handled automatically)
   // No explicit connection needed - Prisma manages pool
   ```

2. **Remove `connectDB()` Call:**
   - Prisma Client connects lazily on first query
   - No need for explicit connection function
   - Or keep for compatibility but rename to `initializePrisma()`

---

#### **8. `/test-setup.js`** ⚠️ **LOW PRIORITY**

**Required Changes:**

1. **Update Environment Variables:**
   ```javascript
   // OLD
   const requiredVars = [
     'MONGO_URI',
     ...
   ];
   
   // NEW
   const requiredVars = [
     'DATABASE_URL', // NeonDB connection string
     ...
   ];
   ```

2. **Update Connection Test:**
   ```javascript
   // OLD
   await connectDB();
   console.log('✅ MongoDB connection test passed');
   
   // NEW
   await prisma.$connect();
   console.log('✅ PostgreSQL (NeonDB) connection test passed');
   await prisma.$disconnect();
   ```

---

### 🗑️ **REMOVE** (MongoDB-Specific Files)

These files/directories should be deleted:

```
backend/
├── (models/)                       ❌ DELETE - Will be replaced by Prisma schema
│   ├── User.js                     ❌ Mongoose model (if exists)
│   ├── Product.js                  ❌ Mongoose model (if exists)
│   └── Order.js                    ❌ Mongoose model (if exists)
└── test-setup.js                   ⚠️ MODIFY (or remove if not needed)
```

**Note:** The `models/` directory doesn't appear in your current structure but is referenced in code. If it exists elsewhere, delete it.

---

### 📦 **Package.json Dependencies**

**Remove:**
```json
{
  "dependencies": {
    "mongoose": "^8.19.2"  ❌ Remove
  }
}
```

**Add:**
```json
{
  "dependencies": {
    "@prisma/client": "^5.x.x",     ✅ Add
    "prisma": "^5.x.x"              ✅ Add (dev dependency)
  },
  "devDependencies": {
    "prisma": "^5.x.x"              ✅ Add
  }
}
```

**Keep:**
- `pg` - Already installed (used by Prisma under the hood)
- `bcryptjs`, `cors`, `dotenv`, `express`, `express-session`, `jsonwebtoken`, `nodemon`, `passport`, `passport-google-oauth20`, `stripe` - All still needed

---

## 🧱 2. Expected Final Backend Structure

### Proposed Target Structure

```
backend/
├── prisma/
│   ├── schema.prisma              # Single source of truth for database schema
│   └── migrations/                # Auto-generated migration files
│       └── ...
├── src/
│   ├── lib/
│   │   └── db.ts                  # Prisma Client initialization
│   ├── routes/
│   │   ├── productRoutes.js       # ✅ Keep (no changes)
│   │   ├── orderRoutes.js         # ✅ Keep (no changes)
│   │   ├── userRoutes.js          # ✅ Keep (no changes)
│   │   └── paymentRoutes.js       # ✅ Keep (no changes)
│   ├── controllers/
│   │   ├── productController.js   # 🛠️ Modify (replace Mongoose with Prisma)
│   │   ├── orderController.js     # 🛠️ Modify (replace Mongoose with Prisma)
│   │   └── userController.js      # 🛠️ Modify (replace Mongoose with Prisma)
│   ├── middleware/
│   │   ├── authMiddleware.js      # 🛠️ Modify (replace User.findById with Prisma)
│   │   └── passportConfig.js      # 🛠️ Modify (replace User queries with Prisma)
│   ├── utils/
│   │   ├── imageUpload.ts         # ✅ Keep (if exists - file upload logic)
│   │   └── paymentHelpers.ts      # ✅ Keep (if exists - Stripe helpers)
│   └── inngest/                   # 📁 Future: Inngest workflows
│       ├── functions/
│       │   ├── orderSync.ts       # Background job for order processing
│       │   └── emailNotifications.ts
│       └── client.ts              # Inngest client setup
├── config/
│   └── (empty or remove)          # ⚠️ Move db.js to src/lib/db.ts
├── server.js                      # 🛠️ Modify (update connection comment)
├── package.json                   # 🛠️ Modify (remove mongoose, add Prisma)
├── .env                           # 🛠️ Modify (update env vars)
├── .env.example                   # 🛠️ Modify (update env vars)
├── README.md                      # 🛠️ Modify (update docs)
├── DEPLOYMENT.md                  # 🛠️ Modify (update deployment guide)
└── render.yaml                    # ✅ Keep (no changes)
```

### Key Differences from Current Structure:

1. **`/prisma/`** - New directory for Prisma schema and migrations
2. **`/src/lib/db.ts`** - Replaces `/config/db.js` with Prisma Client
3. **`/src/inngest/`** - Reserved for future Inngest integration
4. **No `/models/`** - Schema defined in `prisma/schema.prisma` instead
5. **Controllers stay in `/src/controllers/`** - Same location, different imports

---

## 🔧 3. Detailed Modification Guide

### A. Environment Variables Migration

**Current `.env` (MongoDB):**
```env
MONGO_URI=mongodb+srv://...
PG_USER=...
PG_HOST=...
PG_DATABASE=...
PG_PASSWORD=...
PG_PORT=5432
```

**New `.env` (NeonDB + Prisma):**
```env
# Database (NeonDB)
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# JWT & Auth (Keep)
JWT_SECRET=your-secret-key
JWT_EXPIRE=7d
SESSION_SECRET=your-session-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=/api/users/auth/google/callback

# Server (Keep)
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000

# Stripe (Keep if using)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Inngest (Future)
INNGEST_EVENT_KEY=your-inngest-key
INNGEST_SIGNING_KEY=your-signing-key
```

---

### B. Prisma Schema Design (Expected Structure)

Based on your current Mongoose models, here's the expected Prisma schema:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  googleId      String?   @unique
  name          Json      // { firstName: string, lastName: string }
  profilePicture String?
  phone         String?
  password      String?   // For future email/password auth
  role          String    @default("customer") // "customer" | "admin"
  isActive      Boolean   @default(true)
  loginCount    Int       @default(0)
  lastLogin     DateTime?
  preferences   Json?     // Flexible JSON for user preferences
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  addresses     Address[]
  orders        Order[]
  reviews       Review[]

  @@map("users")
}

model Address {
  id          String   @id @default(cuid())
  userId      String
  type        String   // "home" | "work" | "other"
  street      String
  city        String
  state       String?
  zipCode     String
  country     String   @default("Bangladesh")
  isDefault   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("addresses")
}

model Product {
  id          String   @id @default(cuid())
  name        String
  description String   @db.Text
  price       Decimal  @db.Decimal(10, 2)
  category    String
  images      String[] // Array of image URLs
  stock       Int      @default(0)
  isActive    Boolean  @default(true)
  isFeatured  Boolean  @default(false)
  tags        String[]
  dimensions  Json?    // { length, width, height, weight }
  materials   String[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  orderItems  OrderItem[]
  reviews     Review[]

  @@map("products")
}

model Review {
  id        String   @id @default(cuid())
  productId String
  userId    String
  rating    Int      // 1-5
  comment   String?  @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([productId, userId]) // One review per user per product
  @@map("reviews")
}

model Order {
  id              String   @id @default(cuid())
  orderNumber     String   @unique
  userId          String
  status          String   @default("pending") // pending, processing, shipped, delivered, cancelled
  shippingAddress Json     // Full address object
  billingAddress  Json
  subtotal        Decimal  @db.Decimal(10, 2)
  shippingCost    Decimal  @db.Decimal(10, 2)
  tax             Decimal  @db.Decimal(10, 2)
  total           Decimal  @db.Decimal(10, 2)
  paymentMethod   String?
  paymentStatus   String   @default("pending") // pending, paid, failed, refunded
  trackingNumber  String?
  carrier         String?
  estimatedDelivery DateTime?
  notes           Json?    // { customer: string, admin: string }
  timeline        Json[]   // Array of status change events
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  items           OrderItem[]

  @@map("orders")
}

model OrderItem {
  id        String   @id @default(cuid())
  orderId   String
  productId String
  quantity  Int
  price     Decimal  @db.Decimal(10, 2)
  total     Decimal  @db.Decimal(10, 2)
  createdAt DateTime @default(now())

  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product   Product  @relation(fields: [productId], references: [id])

  @@map("order_items")
}
```

**Key Schema Decisions:**
- **JSON fields** for flexible data (name, addresses, preferences)
- **Decimal** for currency (prevents floating-point errors)
- **Relations** instead of embedded documents
- **Cascade deletes** for data integrity
- **Unique constraints** for business rules (one review per user per product)

---

### C. Query Pattern Examples

#### Example 1: Get Products with Filters

**Before (Mongoose):**
```javascript
const products = await Product.find({
  isActive: true,
  category: 'furniture',
  price: { $gte: 100, $lte: 1000 }
})
.sort({ createdAt: -1 })
.skip(0)
.limit(12)
.populate('reviews.user');
```

**After (Prisma):**
```javascript
const products = await prisma.product.findMany({
  where: {
    isActive: true,
    category: 'furniture',
    price: {
      gte: 100,
      lte: 1000
    }
  },
  include: {
    reviews: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profilePicture: true
          }
        }
      }
    }
  },
  orderBy: {
    createdAt: 'desc'
  },
  skip: 0,
  take: 12
});
```

---

#### Example 2: Create Order with Items

**Before (Mongoose):**
```javascript
const order = new Order({
  user: userId,
  items: orderItems,
  pricing: { subtotal, shipping, tax, total }
});
await order.save();
```

**After (Prisma):**
```javascript
const order = await prisma.order.create({
  data: {
    orderNumber: generateOrderNumber(),
    userId: userId,
    items: {
      create: orderItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        total: item.total
      }))
    },
    subtotal: subtotal,
    shippingCost: shippingCost,
    tax: tax,
    total: total,
    shippingAddress: shippingAddress,
    billingAddress: billingAddress
  },
  include: {
    items: {
      include: {
        product: true
      }
    }
  }
});
```

---

#### Example 3: Aggregation Queries

**Before (Mongoose):**
```javascript
const stats = await Order.aggregate([
  {
    $match: { createdAt: { $gte: startDate } }
  },
  {
    $group: {
      _id: null,
      totalOrders: { $sum: 1 },
      totalRevenue: { $sum: '$pricing.total' }
    }
  }
]);
```

**After (Prisma):**
```javascript
// Option 1: Using Prisma groupBy (simpler)
const stats = await prisma.order.groupBy({
  by: [],
  where: {
    createdAt: { gte: startDate }
  },
  _count: {
    id: true
  },
  _sum: {
    total: true
  }
});

// Option 2: Using raw SQL (for complex aggregations)
const stats = await prisma.$queryRaw`
  SELECT 
    COUNT(*) as total_orders,
    SUM(total) as total_revenue
  FROM orders
  WHERE created_at >= ${startDate}
`;
```

---

#### Example 4: Update Product Stock (Transaction)

**Before (Mongoose):**
```javascript
await Product.findByIdAndUpdate(
  productId,
  { $inc: { stock: -quantity } }
);
```

**After (Prisma):**
```javascript
// Using transaction for safety
await prisma.$transaction(async (tx) => {
  const product = await tx.product.findUnique({
    where: { id: productId }
  });
  
  if (product.stock < quantity) {
    throw new Error('Insufficient stock');
  }
  
  await tx.product.update({
    where: { id: productId },
    data: {
      stock: {
        decrement: quantity
      }
    }
  });
});
```

---

## 🚫 4. Files to Remove Immediately

### Confirmed Deletions:

1. **`/models/` directory** (if it exists)
   - All Mongoose model files
   - Will be replaced by `prisma/schema.prisma`

2. **MongoDB-specific test files:**
   - Any files testing MongoDB connection
   - Update `test-setup.js` instead of deleting

### Dependencies to Remove:

```bash
npm uninstall mongoose
```

---

## 🧠 5. Future Integrations (Inngest)

### Reserved Structure for Inngest

```
backend/
└── src/
    └── inngest/
        ├── client.ts              # Inngest client initialization
        ├── functions/
        │   ├── orderSync.ts       # Sync orders to external systems
        │   ├── emailNotifications.ts  # Send order confirmation emails
        │   ├── inventoryUpdate.ts     # Update inventory after orders
        │   └── analyticsSync.ts        # Sync analytics data
        └── events.ts              # Event type definitions
```

### Integration Points:

1. **Order Creation Event:**
   - After `prisma.order.create()`, trigger Inngest event
   - Background job sends confirmation email
   - Updates analytics

2. **Order Status Changes:**
   - When order status updates, trigger Inngest workflow
   - Sends shipping notifications
   - Updates inventory

3. **User Registration:**
   - After user creation, trigger welcome email workflow
   - Sync to marketing platform

### Example Inngest Function (Future):

```typescript
// src/inngest/functions/orderSync.ts
import { inngest } from '../client';

export const orderCreated = inngest.createFunction(
  { id: 'order-created' },
  { event: 'order/created' },
  async ({ event, step }) => {
    // Send confirmation email
    await step.run('send-email', async () => {
      // Email logic
    });
    
    // Update analytics
    await step.run('update-analytics', async () => {
      // Analytics sync
    });
  }
);
```

---

## 📊 Migration Roadmap

### Phase 1: Setup Prisma (Day 1)
- [ ] Install Prisma: `npm install prisma @prisma/client`
- [ ] Initialize Prisma: `npx prisma init`
- [ ] Create `prisma/schema.prisma` based on current models
- [ ] Update `.env` with `DATABASE_URL` (NeonDB connection string)
- [ ] Generate Prisma Client: `npx prisma generate`
- [ ] Run initial migration: `npx prisma migrate dev --name init`

### Phase 2: Update Database Connection (Day 1)
- [ ] Replace `/config/db.js` with `/src/lib/db.ts` (Prisma Client)
- [ ] Update `server.js` to remove `connectDB()` call (or update it)
- [ ] Test Prisma connection

### Phase 3: Migrate Controllers (Day 2-3)
- [ ] Update `productController.js` (replace all Mongoose queries)
- [ ] Update `orderController.js` (replace all Mongoose queries)
- [ ] Update `userController.js` (replace all Mongoose queries)
- [ ] Test each controller endpoint

### Phase 4: Migrate Middleware (Day 3)
- [ ] Update `authMiddleware.js` (replace User queries)
- [ ] Update `passportConfig.js` (replace User queries)
- [ ] Test authentication flows

### Phase 5: Cleanup (Day 4)
- [ ] Remove `mongoose` from `package.json`
- [ ] Delete `/models/` directory (if exists)
- [ ] Update `test-setup.js`
- [ ] Update documentation (README.md, DEPLOYMENT.md)
- [ ] Remove MongoDB environment variables

### Phase 6: Testing & Validation (Day 5)
- [ ] Test all API endpoints
- [ ] Test authentication flows
- [ ] Test order creation and updates
- [ ] Test product queries and filters
- [ ] Test user management
- [ ] Load test (optional)

### Phase 7: Inngest Integration (Future)
- [ ] Install Inngest: `npm install inngest`
- [ ] Create `/src/inngest/` directory structure
- [ ] Set up Inngest client
- [ ] Create event workflows
- [ ] Integrate with order creation/updates

---

## 🔍 Key Considerations

### 1. Data Migration
- **If you have existing MongoDB data:** You'll need a migration script to transfer data to PostgreSQL
- **If starting fresh:** Just run Prisma migrations

### 2. ID Field Changes
- MongoDB uses `_id` (ObjectId)
- Prisma uses `id` (string/cuid by default)
- Update all references from `_id` to `id`
- Update JWT token payload if it stores `_id`

### 3. Embedded Documents → Relations
- MongoDB embedded arrays (e.g., `product.reviews[]`) → Separate tables with foreign keys
- Use Prisma `include` for eager loading
- Consider performance: use `select` to limit fields

### 4. Aggregation Queries
- Complex MongoDB aggregations → Prisma `groupBy` or raw SQL
- Test performance of `$queryRaw` vs Prisma queries

### 5. Transaction Handling
- Prisma transactions are more explicit than Mongoose
- Use `prisma.$transaction()` for multi-step operations

### 6. Type Safety
- Consider migrating to TypeScript for better Prisma integration
- Prisma generates TypeScript types automatically

---

## ✅ Summary Checklist

### Immediate Actions:
- [ ] Review this audit document
- [ ] Set up NeonDB account and get `DATABASE_URL`
- [ ] Install Prisma dependencies
- [ ] Create Prisma schema based on current models
- [ ] Generate Prisma Client

### Before Migration:
- [ ] Backup any existing MongoDB data (if applicable)
- [ ] Update `.env` with NeonDB connection string
- [ ] Test Prisma connection

### During Migration:
- [ ] Replace Mongoose queries with Prisma queries
- [ ] Update all `_id` references to `id`
- [ ] Test each endpoint after migration
- [ ] Update error handling (Prisma errors differ from Mongoose)

### After Migration:
- [ ] Remove `mongoose` dependency
- [ ] Update documentation
- [ ] Deploy to staging environment
- [ ] Monitor for errors
- [ ] Plan Inngest integration

---

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [NeonDB Documentation](https://neon.tech/docs)
- [Inngest Documentation](https://www.inngest.com/docs)
- [MongoDB to PostgreSQL Migration Guide](https://www.prisma.io/docs/guides/migrate-from-mongodb)

---

**Next Steps:** Review this audit, then proceed with Phase 1 of the migration roadmap.

