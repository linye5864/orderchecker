# Component Quick Reference

## Button Variants

| Variant | Usage | Classes |
|---------|-------|---------|
| `default` | Primary action | `bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800` |
| `secondary` | Secondary action | `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50` |
| `outline` | Bordered, no fill | `border border-gray-300 bg-transparent text-gray-700` |
| `ghost` | Minimal | `text-gray-700 hover:bg-gray-50` |
| `link` | Text link | `text-primary-600 underline-offset-4 hover:underline` |

## Button Sizes

| Size | Classes |
|------|---------|
| `sm` | `px-3 py-[6px] text-xs` |
| `default` | `px-5 py-[11px] text-sm` |
| `lg` | `px-8 py-3 text-base` |
| `icon` | `h-9 w-9 p-0` |

## Common Patterns

### Full Width Button
```tsx
<Button className="w-full">Submit</Button>
```

### Icon Button
```tsx
import { Menu } from "lucide-react";

<Button size="icon" variant="ghost">
  <Menu className="h-4 w-4" />
</Button>
```

### Button with Icon
```tsx
import { Plus } from "lucide-react";

<Button>
  <Plus className="h-4 w-4" />
  Add New
</Button>
```

## Input Patterns

### Standard Input
```tsx
<Input type="text" placeholder="Enter text" />
```

### Input with Label
```tsx
<div className="flex flex-col gap-2">
  <label htmlFor="email" className="text-sm font-medium text-gray-700">
    Email
  </label>
  <Input id="email" type="email" placeholder="you@example.com" />
</div>
```

### Disabled Input
```tsx
<Input disabled placeholder="Cannot edit" />
```

## Card Patterns

### Simple Card
```tsx
<Card>
  <CardContent className="p-6">
    Content here
  </CardContent>
</Card>
```

### Card with Header
```tsx
<Card>
  <CardHeader>
    <CardTitle>Settings</CardTitle>
  </CardHeader>
  <CardContent>
    Settings content
  </CardContent>
</Card>
```

### Card with Actions
```tsx
<Card>
  <CardHeader>
    <CardTitle>User Profile</CardTitle>
  </CardHeader>
  <CardContent>
    User information
  </CardContent>
  <CardFooter>
    <Button variant="outline">Cancel</Button>
    <Button>Save Changes</Button>
  </CardFooter>
</Card>
```

## Spacing Guide

### Button + Icon Gap
```tsx
<Button className="gap-2">
  <Icon />
  Text
</Button>
```

### Form Field Spacing
```tsx
<div className="flex flex-col gap-2 mb-4">
  <label>Field</label>
  <Input />
</div>
```

### Card Header/Footer Spacing
```tsx
<CardHeader className="p-6">  {/* padding: 24px */}
<CardContent className="p-6 pt-0">  {/* Remove top padding */}
```

## Color Palette Reference

### Primary Colors
- 50: #eff6ff
- 100: #dbeafe
- 200: #bfdbfe
- 300: #93c5fd
- 400: #60a5fa
- 500: #3b82f6
- 600: #2563eb
- 700: #1d4ed8
- 800: #1e40af
- 900: #1e3a8a

### Gray Colors
- 50: #fafafa
- 100: #f5f5f5
- 200: #e5e5e5
- 300: #d4d4d4
- 400: #a3a3a3
- 500: #737373
- 600: #525252
- 700: #404040
- 800: #262626
- 900: #171717

### Status Colors
- Success: #16a34a
- Warning: #ca8a04
- Error: #dc2626
- Info: #0284c7
