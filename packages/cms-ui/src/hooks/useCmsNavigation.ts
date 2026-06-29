import { useNavigate as useOriginalNavigate } from "react-router-dom";
import { useCmsUiStore } from "../store/cmsUiStore";
import { useCmsAuthStore } from "../api/cmsClient";

export function useCmsUrl() {
  const isEmbed = useCmsUiStore((s) => s.isEmbed);
  const user = useCmsAuthStore((s) => s.user);

  return (path: string) => {
    if (path.startsWith("/community") || path.startsWith("/mentor/community")) return path;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (isEmbed) {
      const isMentor = user?.role?.toLowerCase() === "mentor";
      const base = isMentor ? "/mentor/community" : "/community";
      return cleanPath === "/" ? base : `${base}${cleanPath}`;
    }
    return cleanPath;
  };
}

export function useCmsNavigate() {
  const navigate = useOriginalNavigate();
  const getUrl = useCmsUrl();

  return (to: string | number, options?: any) => {
    if (typeof to === "number") {
      navigate(to);
      return;
    }
    navigate(getUrl(to), options);
  };
}
