/*
 * Bringing the existing store into the unified identity model.
 * ===========================================================================
 * The panel already has admins and the shop already has customers, both with
 * bcrypt hashes of their own. Rather than asking everyone to register again,
 * this walks those records once and gives each an identity in `users`, linked
 * back to the record it came from.
 *
 * It is idempotent and additive: an identity that already exists is left
 * alone, and no existing hash is rewritten. Running it on every boot is safe,
 * which is what makes it useful for a database that gains a new admin through
 * the panel's own "invite" screen later on.
 *
 * The password hashes are *moved by copy*, not rehashed — bcrypt is one-way,
 * so the only way to migrate a password without asking for it is to carry the
 * hash across. Both records keep one until the legacy tables are retired.
 */

import { AdminUserModel, CustomerModel, type AdminUserDoc, type CustomerDoc } from '../db/models.js';
import { normaliseMobile } from './identifiers.js';
import { UserModel } from './models.js';
import { createUser, linkIdentity, roleFromAdminUser } from './users.js';

/** `"Rajesh Gawas"` becomes `{ firstName: 'Rajesh', lastName: 'Gawas' }`. */
function splitName(name: string | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: 'SOPII', lastName: undefined as string | undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined };
}

export async function seedAuthIdentities() {
  const created = { admins: 0, customers: 0 };

  created.admins = await seedAdmins();
  created.customers = await seedCustomers();

  if (created.admins || created.customers) {
    console.log(
      `[auth] identities created — ${created.admins} admin(s), ${created.customers} customer(s)`,
    );
  }
  return created;
}

/* --------------------------------- admins ---------------------------------- */

async function seedAdmins() {
  const admins = await AdminUserModel.find({})
    .select('+passwordHash')
    .lean<AdminUserDoc[]>();

  let count = 0;

  for (const admin of admins) {
    const email = admin.email?.toLowerCase();
    if (!email) continue;

    const existing = await UserModel.findOne({
      $or: [{ adminUserId: admin._id }, { email }],
    }).lean();

    if (existing) {
      // An identity registered on the shop first, then promoted in the panel:
      // point it at the admin record so one sign-in reaches both.
      if (!existing.adminUserId) {
        await UserModel.updateOne(
          { _id: existing._id },
          { $set: { adminUserId: admin._id, role: await roleFromAdminUser(admin.roleId) } },
        );
      }
      continue;
    }

    const { firstName, lastName } = splitName(admin.name);

    const user = await createUser({
      firstName,
      lastName,
      email,
      mobile: normaliseMobile(admin.phone ?? '') ?? undefined,
      // Carried across, never regenerated: the seeded password keeps working.
      passwordHash: admin.passwordHash,
      profileImage: admin.avatar,
      role: await roleFromAdminUser(admin.roleId),
      // A panel-created admin's address is taken as verified — an operator put
      // it there, which is a stronger signal than a confirmation click.
      emailVerified: true,
    });

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          adminUserId: admin._id,
          status: admin.status === 'suspended' ? 'inactive' : 'active',
        },
      },
    );

    await linkIdentity({
      userId: user._id,
      provider: 'password',
      providerUserId: email,
      providerEmail: email,
    });

    count += 1;
  }

  return count;
}

/* -------------------------------- customers -------------------------------- */

/**
 * Only customers who actually set a password get an identity.
 *
 * The panel's seeded customers have none — they exist so the order history
 * looks real, and giving each an identity would fill `users` with rows nobody
 * can sign in as. They are picked up the moment they register, because
 * `ensureCustomerRecord` claims the matching record by email.
 */
async function seedCustomers() {
  const customers = await CustomerModel.find({ passwordHash: { $exists: true, $ne: null } })
    .select('+passwordHash')
    .lean<CustomerDoc[]>();

  let count = 0;

  for (const customer of customers) {
    const email = customer.email?.toLowerCase();
    if (!email || email.endsWith('@no-email.sopii.local')) continue;

    const existing = await UserModel.findOne({
      $or: [{ customerId: customer._id }, { email }],
    }).lean();

    if (existing) {
      if (!existing.customerId) {
        await UserModel.updateOne({ _id: existing._id }, { $set: { customerId: customer._id } });
      }
      continue;
    }

    const { firstName, lastName } = splitName(customer.name);
    const mobile = normaliseMobile(customer.phone ?? '');

    const user = await createUser({
      firstName,
      lastName,
      email,
      // Only when it is free — two seeded customers sharing a number would
      // collide on the unique index and abort the whole boot.
      mobile: mobile && !(await UserModel.exists({ mobile })) ? mobile : undefined,
      passwordHash: customer.passwordHash,
      profileImage: customer.avatar,
      role: 'customer',
      acceptsMarketing: customer.acceptsMarketing,
    });

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          customerId: customer._id,
          status: customer.status === 'blocked' ? 'inactive' : 'active',
        },
      },
    );

    await linkIdentity({
      userId: user._id,
      provider: 'password',
      providerUserId: email,
      providerEmail: email,
    });

    count += 1;
  }

  return count;
}
