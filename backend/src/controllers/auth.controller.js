const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("../utils/logger.js");

const AUTH_CACHE_TTL = 3600; // 1 hour

const snapshotExists = (snap) => {
  if (!snap) return false;
  if (snap.exists === true) return true;
  if (typeof snap.exists === "function") return snap.exists();
  return !!snap._document;
};

const findSuperadminProfile = async ({ uid, email }) => {
  let superadminSnap = await db.collection("superadmins").doc(uid).get();

  if (snapshotExists(superadminSnap)) {
    return {
      data: superadminSnap.data?.() || superadminSnap.data || superadminSnap,
      sourceCollection: "superadmins",
      role: "superadmin",
    };
  }

  if (email) {
    logger.debug(
      `[AuthController] UID not found in superadmins, searching by email: ${email}`,
    );
    const emailSearch = await db
      .collection("superadmins")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!emailSearch.empty) {
      const match = emailSearch.docs[0];
      return {
        data: match.data(),
        sourceCollection: "superadmins",
        role: "superadmin",
      };
    }
  }

  return null;
};
/**
 * Get the current user's profile with role
 * This endpoint has backend permissions to read from Firestore
 * The frontend calls this instead of directly accessing Firestore
 */
exports.getUserProfile = async (req, res) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(401).json({
        success: false,
        error: "Authentication required - no user in context",
      });
    }

    logger.debug(`[AuthController] Getting profile for user: ${uid}`);

    // Cache hit — zero Firestore reads
    const cacheKey = `auth_role_${uid}`;
    const cached = await cache.get(cacheKey);
    if (cached && cached.role) {
      logger.debug(`[AuthController] Cache hit for uid: ${uid}`);
      return res.status(200).json({
        success: true,
        user: {
          id: uid,
          email: req.user?.email || cached.email || "",
          displayName:
            cached.display_name ||
            cached.full_name ||
            req.user?.email?.split("@")[0] ||
            "User",
          role: cached.role,
          plan: cached.plan || "pro",
          community_id: cached.community_id || undefined,
          customer_id:
            req.user?.customer_id || cached.customer_id || cached.uid || uid,
          sourceCollection: cached.sourceCollection || "cache",
        },
      });
    }

    let profileData = null;
    let sourceCollection = "customers";
    let role = "customer";

    try {
      const superadminProfile = await findSuperadminProfile({
        uid,
        email: req.user?.email,
      });
      if (superadminProfile) {
        profileData = superadminProfile.data;
        sourceCollection = superadminProfile.sourceCollection;
        role = superadminProfile.role;
        logger.debug(
          `[AuthController] ✅ User found in SUPERADMINS collection`,
        );
      }
    } catch (err) {
      logger.error(`[AuthController] Error checking superadmins:`, {
        message: err.message,
        code: err.code,
        stack: err.stack,
      });
    }

    // If not found in superadmins, try users (Priority 2)
    if (!profileData) {
      try {
        const usersRef = db.collection("users").doc(uid);
        const usersSnap = await usersRef.get();

        let usersExists = false;
        if (usersSnap && usersSnap.exists === true) {
          usersExists = true;
        } else if (
          usersSnap &&
          typeof usersSnap.exists === "function" &&
          usersSnap.exists()
        ) {
          usersExists = true;
        } else if (usersSnap && usersSnap._document) {
          usersExists = !!usersSnap._document;
        }

        if (usersExists) {
          profileData = usersSnap.data?.() || usersSnap.data || usersSnap;
          sourceCollection = "users";

          // Get role from users profile
          if (profileData?.role) {
            role = profileData.role.trim().toLowerCase().replace(/\s+/g, "");
          } else {
            role = "superadmin";
          }
          logger.debug(
            `[AuthController] ✅ User found in USERS collection with role: ${role}`,
          );
        }
      } catch (err) {
        logger.error(`[AuthController] Error checking users:`, {
          message: err.message,
          code: err.code,
        });
      }
    }

    // If not found in superadmins/users, try customers (Priority 3)
    if (!profileData) {
      try {
        const customerRef = db.collection("customers").doc(uid);
        const customerSnap = await customerRef.get();

        if (snapshotExists(customerSnap)) {
          profileData =
            customerSnap.data?.() || customerSnap.data || customerSnap;
          sourceCollection = "customers";

          // Get role from customer profile if it exists
          if (profileData?.role) {
            role = profileData.role.trim().toLowerCase().replace(/\s+/g, "");
          }
          logger.debug(
            `[AuthController] ✅ User found in CUSTOMERS collection`,
          );
        }
      } catch (err) {
        logger.error(`[AuthController] Error checking customers:`, {
          message: err.message,
          code: err.code,
          stack: err.stack,
          details: err.details,
        });
      }
    }

    logger.debug(
      `[AuthController] 🎯 User ${uid} => role: '${role}' (from ${sourceCollection})`,
    );

    // Cache the result for 1 hour
    if (profileData) {
      await cache.set(
        cacheKey,
        {
          ...profileData,
          role,
          sourceCollection,
        },
        AUTH_CACHE_TTL,
      );
    }

    // Return user profile with correct role
    return res.status(200).json({
      success: true,
      user: {
        id: uid,
        email: req.user?.email || profileData?.email || "",
        displayName:
          profileData?.display_name ||
          profileData?.full_name ||
          req.user?.email?.split("@")[0] ||
          "User",
        role: role,
        plan: profileData?.plan || "pro",
        community_id: profileData?.community_id || undefined,
        customer_id:
          req.user?.customer_id ||
          profileData?.customer_id ||
          profileData?.uid ||
          uid,
        sourceCollection: sourceCollection,
      },
    });
  } catch (error) {
    logger.error(`[AuthController] Error getting user profile:`, error);

    return res.status(500).json({
      success: false,
      error: "Failed to get user profile",
    });
  }
};

exports.createCustomerProfile = async (req, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || "";
    const displayName = String(
      req.body?.displayName || req.body?.full_name || req.body?.fullName || "",
    ).trim();

    if (!uid) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (!displayName) {
      return res.status(400).json({
        success: false,
        error: "displayName is required",
      });
    }

    const customerRef = db.collection("customers").doc(uid);
    const existingProfile = await customerRef.get();

    if (snapshotExists(existingProfile)) {
      const data = existingProfile.data?.() || existingProfile.data() || {};
      return res.status(200).json({
        success: true,
        created: false,
        profile: {
          uid,
          ...data,
        },
      });
    }

    const profile = {
      uid,
      firebase_uid: uid,
      customer_id: uid,
      email,
      full_name: displayName,
      display_name: displayName,
      role: "customer",
      plan: "pro",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await customerRef.set(profile);
    await cache.del(`auth_role_${uid}`).catch(() => {});

    return res.status(201).json({
      success: true,
      created: true,
      profile,
    });
  } catch (error) {
    logger.error(`[AuthController] Error creating customer profile:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to create customer profile",
    });
  }
};

/**
 * Verify Firebase ID token and return user info
 * Used for initial login verification
 */
exports.verifyToken = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: "ID token required",
      });
    }

    // Verify the token — retry once on transient failures (e.g. Firebase Admin
    // fetching Google public keys on cold-start, or a brief network blip).
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (firstErr) {
      logger.warn(
        `[AuthController] First verifyIdToken attempt failed (${firstErr.code || firstErr.message}), retrying once…`,
      );
      await new Promise((r) => setTimeout(r, 800));
      // Second attempt — if this throws it will bubble to the outer catch
      decodedToken = await admin.auth().verifyIdToken(idToken);
    }

    logger.debug(
      `[AuthController] 🔐 Token verified for user: ${decodedToken.uid}`,
    );
    logger.debug(`[AuthController] Email: ${decodedToken.email}`);

    // Cache hit — zero Firestore reads
    const cacheKey = `auth_role_${decodedToken.uid}`;
    const cached = await cache.get(cacheKey);
    if (cached && cached.role) {
      logger.debug(`[AuthController] Cache hit for uid: ${decodedToken.uid}`);
      return res.status(200).json({
        success: true,
        user: {
          id: decodedToken.uid,
          email: decodedToken.email || "",
          displayName:
            cached.display_name ||
            cached.full_name ||
            decodedToken.email?.split("@")[0] ||
            "User",
          role: cached.role,
          plan: cached.plan || "pro",
          community_id: cached.community_id || undefined,
          customer_id: cached.customer_id || cached.uid || decodedToken.uid,
        },
      });
    }

    // Get the user's profile data
    let profileData = null;
    let sourceCollection = "customers";
    let role = "customer";

    try {
      logger.debug(
        `[AuthController] Checking superadmins collection for ${decodedToken.uid}...`,
      );
      const superadminProfile = await findSuperadminProfile({
        uid: decodedToken.uid,
        email: decodedToken.email,
      });

      if (superadminProfile) {
        profileData = superadminProfile.data;
        sourceCollection = superadminProfile.sourceCollection;
        role = superadminProfile.role;
        logger.debug(
          `[AuthController] ✅ User FOUND in SUPERADMINS collection`,
        );
      }
    } catch (err) {
      logger.error(`[AuthController] Error checking superadmins:`, {
        message: err.message,
        code: err.code,
        stack: err.stack,
        details: err.details,
      });
    }

    // If not in superadmins, check users
    if (!profileData) {
      try {
        logger.debug(
          `[AuthController] Not in superadmins, checking users collection...`,
        );
        const usersSnap = await db
          .collection("users")
          .doc(decodedToken.uid)
          .get();

        let usersExists = false;
        if (usersSnap && usersSnap.exists === true) {
          usersExists = true;
        } else if (
          usersSnap &&
          typeof usersSnap.exists === "function" &&
          usersSnap.exists()
        ) {
          usersExists = true;
        } else if (usersSnap && usersSnap._document) {
          usersExists = !!usersSnap._document;
        }

        logger.debug(`[AuthController] Users check - Exists: ${usersExists}`);

        if (usersExists) {
          profileData = usersSnap.data?.() || usersSnap.data || usersSnap;
          sourceCollection = "users";

          if (profileData?.role) {
            role = profileData.role.trim().toLowerCase().replace(/\s+/g, "");
          } else {
            role = "superadmin";
          }
          logger.debug(
            `[AuthController] ✅ User FOUND in USERS collection with role: ${role}`,
          );
        }
      } catch (err) {
        logger.error(`[AuthController] Error checking users:`, {
          message: err.message,
          code: err.code,
        });
      }
    }

    // If not in superadmins/users, check customers
    if (!profileData) {
      try {
        logger.debug(
          `[AuthController] Not in users/superadmins, checking customers collection...`,
        );
        const customerSnap = await db
          .collection("customers")
          .doc(decodedToken.uid)
          .get();

        const customerExists = snapshotExists(customerSnap);

        logger.debug(
          `[AuthController] Customers check - Exists: ${customerExists}`,
        );

        if (customerExists) {
          profileData =
            customerSnap.data?.() || customerSnap.data || customerSnap;
          sourceCollection = "customers";

          // Get role from customer profile if it exists
          if (profileData?.role) {
            role = profileData.role.trim().toLowerCase().replace(/\s+/g, "");
          }
          logger.debug(
            `[AuthController] ✅ User FOUND in CUSTOMERS collection`,
          );
        } else {
          logger.debug(
            `[AuthController] ⚠️ User NOT found in users, superadmins, or customers`,
          );
        }
      } catch (err) {
        logger.error(`[AuthController] Error checking customers:`, {
          message: err.message,
          code: err.code,
          stack: err.stack,
          details: err.details,
        });
      }
    }

    logger.debug(
      `[AuthController] ✨ FINAL RESPONSE: role=${role}, sourceCollection=${sourceCollection}`,
    );

    // Cache the result for 1 hour
    if (profileData) {
      await cache.set(
        cacheKey,
        {
          ...profileData,
          role,
          sourceCollection,
        },
        AUTH_CACHE_TTL,
      );
    }

    return res.status(200).json({
      success: true,
      user: {
        id: decodedToken.uid,
        email: decodedToken.email || "",
        displayName:
          profileData?.display_name ||
          profileData?.full_name ||
          decodedToken.email?.split("@")[0] ||
          "User",
        role: role,
        plan: profileData?.plan || "pro",
        community_id: profileData?.community_id || undefined,
        customer_id:
          profileData?.customer_id || profileData?.uid || decodedToken.uid,
      },
    });
  } catch (error) {
    logger.error(`[AuthController] ❌ Error verifying token:`, error);

    return res.status(401).json({
      success: false,
      error: "Token verification failed",
    });
  }
};
