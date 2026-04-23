const { db, admin } = require("../config/firebase.js");

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

    let profileData = null;
    let sourceCollection = "customers";
    let role = "customer";

    try {
      // Try superadmins collection first (Priority 1)
      const superadminRef = db.collection("superadmins").doc(uid);
      const superadminSnap = await superadminRef.get();
      
      // Check if snapshot exists - handle both REST and Admin SDK formats
      let superadminExists = false;
      if (superadminSnap && superadminSnap.exists === true) {
        superadminExists = true;
      } else if (superadminSnap && typeof superadminSnap.exists === 'function' && superadminSnap.exists()) {
        superadminExists = true;
      } else if (superadminSnap && superadminSnap._document) {
        // REST API format
        superadminExists = !!superadminSnap._document;
      }
      
      if (superadminExists) {
        profileData = superadminSnap.data?.() || superadminSnap.data || superadminSnap;
        sourceCollection = "superadmins";
        role = "superadmin";
        logger.debug(`[AuthController] ✅ User found in SUPERADMINS collection`);
      }
    } catch (err) {
      logger.error(`[AuthController] Error checking superadmins: ${err.message}`);
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
        logger.error(`[AuthController] Error checking customers: ${err.message}`);
      }
    }

    logger.debug(`[AuthController] 🎯 User ${uid} => role: '${role}' (from ${sourceCollection})`);

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

    // Get the user's profile data
    let profileData = null;
    let sourceCollection = "customers";
    let role = "customer";

    try {
      // Check superadmins first
      logger.debug(`[AuthController] Checking superadmins collection for ${decodedToken.uid}...`);
      const superadminSnap = await db.collection("superadmins").doc(decodedToken.uid).get();
      
      // Check if snapshot exists - handle both REST and Admin SDK formats
      let superadminExists = false;
      if (superadminSnap && superadminSnap.exists === true) {
        superadminExists = true;
      } else if (superadminSnap && typeof superadminSnap.exists === 'function' && superadminSnap.exists()) {
        superadminExists = true;
      } else if (superadminSnap && superadminSnap._document) {
        // REST API format
        superadminExists = !!superadminSnap._document;
      }
      
      logger.debug(`[AuthController] Superadmins check - Exists: ${superadminExists}`);
      
      if (superadminExists) {
        // Try different data access patterns
        profileData = superadminSnap.data?.() || superadminSnap.data || superadminSnap;
        sourceCollection = "superadmins";
        role = "superadmin";
        logger.debug(`[AuthController] ✅ User FOUND in SUPERADMINS collection`);
        logger.debug(`[AuthController] Profile data:`, profileData);
      }
    } catch (err) {
      logger.error(`[AuthController] Error checking superadmins:`, err.message);
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
        logger.error(`[AuthController] Error checking customers:`, err.message);
      }
    }

    logger.debug(`[AuthController] ✨ FINAL RESPONSE: role=${role}, sourceCollection=${sourceCollection}`);

    return res.status(200).json({
      success: true,
      user: {
        id: decodedToken.uid,
        email: decodedToken.email || "",
        displayName: profileData?.display_name || profileData?.full_name || decodedToken.email?.split("@")[0] || "User",
        role: role,
        plan: profileData?.plan || "pro",
        community_id: profileData?.community_id || undefined
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
