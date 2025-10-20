import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/ui/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      // 统一间距系统（8px 网格）
      spacing: {
        '1': '4px',   // 极紧凑
        '2': '8px',   // 紧凑
        '4': '16px',  // 标准
        '6': '24px',  // 宽松
        '8': '32px',  // 区块
        '12': '48px', // 大区块
      },
      // 简化字体大小层级
      fontSize: {
        'xs': ['12px', { lineHeight: '16px' }],   // 辅助信息
        'sm': ['14px', { lineHeight: '20px' }],   // 正文（默认）
        'base': ['16px', { lineHeight: '24px' }], // 强调正文
        'lg': ['18px', { lineHeight: '28px' }],   // 小标题
        'xl': ['20px', { lineHeight: '32px' }],   // 页面标题
      },
      // 简化字重
      fontWeight: {
        'normal': '400',   // 正文
        'medium': '500',   // 强调
        'semibold': '600', // 标题
      },
      // 极简化阴影（减少使用）
      boxShadow: {
        'sm': '0 1px 2px 0 rgb(0 0 0 / 0.03)',
        'DEFAULT': '0 1px 3px 0 rgb(0 0 0 / 0.05)',
        'md': '0 2px 4px -1px rgb(0 0 0 / 0.03)',
        'none': 'none',
      },
      // 极简化圆角
      borderRadius: {
        'none': '0',
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '12px',
        'full': '9999px',
      },
      // 极微妙的透明度
      opacity: {
        '2': '0.02',
        '5': '0.05',
      },
    }
  }
} satisfies Config;
