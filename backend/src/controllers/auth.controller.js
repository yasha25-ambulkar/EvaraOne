const { db, admin } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("../utils/logger.js");

const AUTH_CACHE_TTL = 3600; // 1 hour
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
        error: "Authentication required - no user in context"
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
          displayName: cached.display_name || cached.full_name || req.user?.email?.split("@")[0] || "User",
          role: cached.role,
          plan: cached.plan || "pro",
          community_id: cached.community_id || undefined,
          customer_id: req.user?.customer_id || cached.customer_id || cached.uid || uid,
          sourceCollection: cached.sourceCollection || "cache"
        }
      });
    }

    let profileData = null;
    let sourceCollection = "customers";
    let role = "customer";

    try {
      // Try users collection first (Priority 1) - stores superadmin roles
      const usersRef = db.collection("users").doc(uid);
      const usersSnap = await usersRef.get();
      
      let usersExists = false;
      if (usersSnap && usersSnap.exists === true) {
        usersExists = true;
      } else if (usersSnap && typeof usersSnap.exists === 'function' && usersSnap.exists()) {
        usersExists = true;
      } else if (usersSnap && usersSnap._document) {
        usersExists = !!usersSnap._document;
      }
      
      if (usersExists) {
        profileData = usersSnap.data?.() || usersSnap.data || usersSnap;
        sourceCollection = "users";
        
        // Get role from users profile
        if (profileData?.role) {
          role = (profileData.role).trim().toLowerCase().replace(/\s+/g, "");
        } else {
          role = "superadmin"; // Default to superadmin if in users collection
        }
        logger.debug(`[AuthController] ✅ User found in USERS collection with role: ${role}`);
      }
    } catch (err) {
      logger.error(`[AuthController] Error checking users:`, {
        message: err.message,
        code: err.code,
      });
    }

    // If not found in superadmins, try customers (Priority 2)
    if (!profileData) {
      try {
        const customerRef = db.collection("customers").doc(uid);
        const customerSnap = await customerRef.get();
        
        // Check if snapshot exists - handle both REST and Admin SDK formats
        let customerExists = false;
        if (customerSnap && customerSnap.exists === true) {
          customerExists = true;
        } else if (customerSnap && typeof customerSnap.exists === 'function' && customerSnap.exists()) {
          customerExists = true;
        } else if (customerSnap && customerSnap._document) {
          // REST API format
          customerExists = !!customerSnap._document;
        }
        
        if (customerExists) {
          profileData = customerSnap.data?.() || customerSnap.data || customerSnap;
          sourceCollection = "customers";
          
          // Get role from customer profile if it exists
          if (profileData?.role) {
            role = (profileData.role).trim().toLowerCase().replace(/\s+/g, "");
          }
          logger.debug(`[AuthController] ✅ User found in CUSTOMERS collection`);
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

    logger.debug(`[AuthController] 🎯 User ${uid} => role: '${role}' (from ${sourceCollection})`);

    // Cache the result for 1 hour
    if (profileData) {
      await cache.set(cacheKey, {
        ...profileData,
        role,
        sourceCollection,
      }, AUTH_CACHE_TTL);
    }

    // Return user profile with correct role
    return res.status(200).json({
      success: true,
      user: {
        id: uid,
        email: req.user?.email || profileData?.email || "",
        displayName: profileData?.display_name || profileData?.full_name || req.user?.email?.split("@")[0] || "User",
        role: role,
        plan: profileData?.plan || "pro",
        community_id: profileData?.community_id || undefined,
        customer_id: req.user?.customer_id || profileData?.customer_id || profileData?.uid || uid,
        sourceCollection: sourceCollection
      }
    });

  } catch (error) {
    logger.error(`[AuthController] Error getting user profile:`, error);
    
    return res.status(500).json({
      success: false,
      error: "Failed to get user profile"
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
        error: "ID token required"
      });
    }

    // Verify the token — retry once on transient failures (e.g. Firebase Admin
    // fetching Google public keys on cold-start, or a brief network blip).
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (firstErr) {
      logger.warn(`[AuthController] First verifyIdToken attempt failed (${firstErr.code || firstErr.message}), retrying once…`);
      await new Promise((r) => setTimeout(r, 800));
      // Second attempt — if this throws it will bubble to the outer catch
      decodedToken = await admin.auth().verifyIdToken(idToken);
    }
    
    logger.debug(`[AuthController] 🔐 Token verified for user: ${decodedToken.uid}`);
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
          displayName: cached.display_name || cached.full_name || decodedToken.email?.split("@")[0] || "User",
          role: cached.role,
          plan: cached.plan || "pro",
          community_id: cached.community_id || undefined,
          customer_id: cached.customer_id || cached.uid || decodedToken.uid
        }
      });
    }

    // Get the user's profile data
    let profileData = null;
    let sourceCollection = "customers";
    let role = "customer";

    try {
      // Check users collection first (Priority 1)
      logger.debug(`[AuthController] Checking users collection for ${decodedToken.uid}...`);
      const usersSnap = await db.collection("users").doc(decodedToken.uid).get();
      
      let usersExists = false;
      if (usersSnap && usersSnap.exists === true) {
        usersExists = true;
      } else if (usersSnap && typeof usersSnap.exists === 'function' && usersSnap.exists()) {
        usersExists = true;
      } else if (usersSnap && usersSnap._document) {
        usersExists = !!usersSnap._document;
      }
      
      logger.debug(`[AuthController] Users check - Exists: ${usersExists}`);
      
      if (usersExists) {
        profileData = usersSnap.data?.() || usersSnap.data || usersSnap;
        sourceCollection = "users";
        
        // Get role from profile
        if (profileData?.role) {
          role = (profileData.role).trim().toLowerCase().replace(/\s+/g, "");
        } else {
          role = "superadmin"; // Default to superadmin if in users collection
        }
        logger.debug(`[AuthController] ✅ User FOUND in USERS collection with role: ${role}`);
      }
    } catch (err) {
      logger.error(`[AuthController] Error checking users:`, {
        message: err.message,
        code: err.code,
      });
    }

    // If not in superadmins, check customers
    if (!profileData) {
      try {
        logger.debug(`[AuthController] Not in superadmins, checking customers collection...`);
        const customerSnap = await db.collection("customers").doc(decodedToken.uid).get();
        
        // Check if snapshot exists - handle both REST and Admin SDK formats
        let customerExists = false;
        if (customerSnap && customerSnap.exists === true) {
          customerExists = true;
        } else if (customerSnap && typeof customerSnap.exists === 'function' && customerSnap.exists()) {
          customerExists = true;
        } else if (customerSnap && customerSnap._document) {
          // REST API format
          customerExists = !!customerSnap._document;
        }
        
        logger.debug(`[AuthController] Customers check - Exists: ${customerExists}`);
        
        if (customerExists) {
          profileData = customerSnap.data?.() || customerSnap.data || customerSnap;
          sourceCollection = "customers";
          
          // Get role from customer profile if it exists
          if (profileData?.role) {
            role = (profileData.role).trim().toLowerCase().replace(/\s+/g, "");
          }
          logger.debug(`[AuthController] ✅ User FOUND in CUSTOMERS collection`);
        } else {
          logger.debug(`[AuthController] ⚠️ User NOT found in either superadmins or customers`);
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

    logger.debug(`[AuthController] ✨ FINAL RESPONSE: role=${role}, sourceCollection=${sourceCollection}`);

    // Cache the result for 1 hour
    if (profileData) {
      await cache.set(cacheKey, {
        ...profileData,
        role,
        sourceCollection,
      }, AUTH_CACHE_TTL);
    }

    return res.status(200).json({
      success: true,
      user: {
        id: decodedToken.uid,
        email: decodedToken.email || "",
        displayName: profileData?.display_name || profileData?.full_name || decodedToken.email?.split("@")[0] || "User",
        role: role,
        plan: profileData?.plan || "pro",
        community_id: profileData?.community_id || undefined,
        customer_id: profileData?.customer_id || profileData?.uid || decodedToken.uid
      }
    });

  } catch (error) {
    logger.error(`[AuthController] ❌ Error verifying token:`, error);
    
    return res.status(401).json({
      success: false,
      error: "Token verification failed"
    });
  }
};
