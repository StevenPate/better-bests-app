import { HomeIcon, AlertCircle, LogIn } from "lucide-react";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { Auth } from "./pages/Auth.tsx";

export const navItems = [
  {
    title: "Home",
    to: "/",
    icon: <HomeIcon className="h-4 w-4" />,
    page: <Index />,
  },
  {
    title: "Auth",
    to: "/auth",
    icon: <LogIn className="h-4 w-4" />,
    page: <Auth />,
  },
  {
    title: "Not Found",
    to: "/404",
    icon: <AlertCircle className="h-4 w-4" />,
    page: <NotFound />,
  },
];