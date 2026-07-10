import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';
import { useThemeConfig } from '@/components/themes/active-theme';
import { THEMES } from '@/components/themes/theme.config';

const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();
  const { activeTheme, setActiveTheme } = useThemeConfig();

  const toggleDarkLight = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.value === activeTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setActiveTheme(THEMES[nextIndex].value);
  };

  const themeActions = [
    {
      id: 'cycleTheme',
      name: 'Сменить цветовую схему',
      shortcut: ['t', 't'],
      section: 'Тема',
      perform: cycleTheme
    },
    {
      id: 'toggleDarkLight',
      name: 'Переключить Темный/Светлый режим',
      shortcut: ['d', 'd'],
      section: 'Тема',
      perform: toggleDarkLight
    },
    {
      id: 'setLightTheme',
      name: 'Установить Светлую тему',
      section: 'Тема',
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: 'Установить Темную тему',
      section: 'Тема',
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(themeActions, [theme, activeTheme]);
};

export default useThemeSwitching;
