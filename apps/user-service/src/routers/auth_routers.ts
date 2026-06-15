



import { LoginController, LogOutController, RefreshTokenController, RegisterController } from "../controllers/user.controller";
import { router } from "../settings/router.config";

router.post("/auth/register", RegisterController)
router.post("/auth/login", LoginController)
router.post("/auth/logout", LogOutController)
router.post("/auth/refresh", RefreshTokenController)


export {router as AuthRouter}