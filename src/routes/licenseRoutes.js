
const router = require("express").Router();
const { generateLicense, getAllLicenses , renewLicense } = require("../controllers/licenseController");

const verifySuperAdmin = (req, res, next) => {
    const user = req.user;
    if (user && user.role === 'super_admin') {
        next();
    } else {
        return res.status(403).json({ message: "Forbidden" });
    }
}

router.post("/generate-license", verifySuperAdmin, generateLicense);
router.get("/get-all-licenses", verifySuperAdmin, getAllLicenses);
router.put("/renew-license/:id", verifySuperAdmin, renewLicense);

module.exports = router;

