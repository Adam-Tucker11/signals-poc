# Signals Design System

This document outlines the design system for the Signals Intelligence Platform, following Linear/Notion/Slack design principles.

## Design Philosophy

Our design system prioritizes:
- **Simplicity**: Clean, uncluttered interfaces
- **Consistency**: Systematic use of spacing, typography, and colors
- **Accessibility**: High contrast and clear visual hierarchy
- **Performance**: Minimal animations and effects

## Color Palette

### Primary Colors
```css
--background: 0 0% 100%          /* Pure white */
--foreground: 240 10% 3.9%       /* Near black */
--muted: 240 4.8% 95.9%         /* Light gray */
--muted-foreground: 240 3.8% 46.1% /* Medium gray */
--border: 240 5.9% 90%          /* Border gray */
```

### Accent Colors
```css
--blue-500: 221 83% 53%         /* Primary blue */
--blue-600: 221 83% 47%         /* Darker blue */
--green-500: 142 76% 36%        /* Success green */
--green-600: 142 76% 30%        /* Darker green */
--amber-500: 43 96% 56%         /* Warning amber */
--amber-600: 43 96% 50%         /* Darker amber */
```

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
```

### Type Scale
- **H1**: 1.875rem (30px) - Page titles
- **H2**: 1.5rem (24px) - Section headers
- **H3**: 1.25rem (20px) - Card titles
- **Body**: 14px - Default text
- **Small**: 12px - Captions and metadata
- **XS**: 10px - Labels and badges

### Font Weights
- **Regular**: 400 - Body text
- **Medium**: 500 - Labels and buttons
- **Semibold**: 600 - Headers and emphasis
- **Bold**: 700 - Strong emphasis

## Spacing System

Based on 4px grid:
- **4px** - Minimal spacing
- **8px** - Small spacing
- **12px** - Medium spacing
- **16px** - Standard spacing
- **24px** - Large spacing
- **32px** - Extra large spacing
- **48px** - Section spacing

## Components

### Cards
```css
.card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 24px;
  transition: border-color 0.15s ease;
}
```

### Buttons
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  cursor: pointer;
}
```

Button variants:
- **Primary**: Dark background, white text
- **Secondary**: Light background, dark text
- **Ghost**: Transparent background, subtle hover

### Inputs
```css
.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  font-size: 14px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  transition: border-color 0.15s ease;
}
```

### Badges
```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}
```

Badge variants:
- **Blue**: Primary actions and links
- **Green**: Success states
- **Amber**: Warning states
- **Gray**: Neutral information

## Layout

### Sidebar
- Width: 280px
- Background: White
- Border: Right border only
- Padding: 24px 16px

### Main Content
- Container: max-width 1200px
- Padding: 24px
- Responsive grid system

### Grid System
```css
.grid-cols-auto-fit {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
```

## Icons

We use Lucide React icons for consistency:
- Size: 16px for navigation, 20px for headers, 24px for large elements
- Color: Inherit from parent or use semantic colors
- Stroke width: 1.5px for crisp appearance

## Interactions

### Hover States
- Subtle background color changes
- Border color adjustments
- No dramatic transforms or shadows

### Focus States
```css
.focus-ring {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
}
```

### Transitions
- Duration: 150ms
- Easing: ease
- Properties: color, background-color, border-color

## Animations

### Fade In
```css
.animate-in {
  animation: fadeIn 0.2s ease-out;
}
```

### Pulse
```css
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

## Accessibility

### Color Contrast
- Minimum 4.5:1 ratio for normal text
- Minimum 3:1 ratio for large text
- All colors tested for accessibility

### Focus Management
- Visible focus indicators
- Logical tab order
- Keyboard navigation support

### Screen Reader Support
- Semantic HTML structure
- ARIA labels where needed
- Descriptive alt text for images

## Responsive Design

### Breakpoints
- **Mobile**: < 768px
- **Tablet**: 768px - 1024px
- **Desktop**: > 1024px

### Mobile Adaptations
- Sidebar collapses to overlay
- Single column layouts
- Touch-friendly button sizes (44px minimum)

## Best Practices

### Do's
- Use consistent spacing and typography
- Maintain clear visual hierarchy
- Keep interactions subtle and purposeful
- Test with real content
- Consider accessibility first

### Don'ts
- Avoid heavy gradients or shadows
- Don't use too many colors
- Avoid complex animations
- Don't sacrifice readability for aesthetics
- Avoid inconsistent spacing

## Implementation Notes

### CSS Variables
All colors and spacing values are defined as CSS custom properties for easy theming and maintenance.

### Component Classes
Use semantic class names that describe the purpose, not the appearance.

### Dark Mode
The design system includes dark mode support with appropriate color mappings.

## Resources

- [Linear Design System](https://linear.app/design)
- [Notion Design Principles](https://www.notion.so/design)
- [Slack Design Guidelines](https://slack.design/)
- [Lucide Icons](https://lucide.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
