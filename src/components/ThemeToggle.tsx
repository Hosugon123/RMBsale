import { Moon, Sun } from "lucide-react";
import { useTheme } from "../features/ThemeProvider";
import { Button } from "./ui/button";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggleTheme}
      title={isDark ? "切換淺色主題" : "切換深色主題"}
      aria-label={isDark ? "切換淺色主題" : "切換深色主題"}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
