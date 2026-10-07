import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { themeLabel } from '../themes';

interface ThemePickerProps {
    theme: string;
    themes: string[];
    onSelect: (theme: string) => void;
}

// AirTime Dark and Light are the only themes, so one click swaps between them.
export function ThemePicker({ theme, themes, onSelect }: ThemePickerProps) {
    const next = themes.find((id) => id !== theme);
    if (!next) return null;

    const label = `Switch to ${themeLabel(next)}`;
    const Icon = theme.endsWith('light') ? Moon : Sun;

    return (
        <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onSelect(next)}
            aria-label={label}
            title={label}
            className="text-subtle-foreground hover:text-foreground"
        >
            <Icon size={18} />
        </Button>
    );
}
