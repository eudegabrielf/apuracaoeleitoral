"use client";

import { useEffect, useState } from "react";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystem = () => {
      if (!window.localStorage.getItem("apuracaoeleitoral:theme")) {
        root.classList.toggle("dark", media.matches);
        setDark(media.matches);
      }
    };

    setDark(root.classList.contains("dark"));
    media.addEventListener("change", applySystem);
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      media.removeEventListener("change", applySystem);
      observer.disconnect();
    };
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("apuracaoeleitoral:theme", next ? "dark" : "light");
    setDark(next);
  };

  return (
    <Button
      variant="secondary"
      size="small"
      iconOnly
      leadingIcon={dark ? RiSunLine : RiMoonLine}
      aria-label={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={dark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={toggle}
    />
  );
}
