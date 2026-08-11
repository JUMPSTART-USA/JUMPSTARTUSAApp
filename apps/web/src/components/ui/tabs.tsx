import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';
import { PillOverflow, usePillOverflow } from '@/components/ui/pill-overflow';

export const Tabs = TabsPrimitive.Root;

/** Shared pill-bar classes — SubNav reuses these so link-based nav matches Tabs. */
export const tabsListClasses =
  'inline-flex h-9 max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground';
export const tabsTriggerClasses =
  'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const tabsTriggerActiveClasses = 'bg-card text-foreground shadow-sm';

/**
 * Same overflow treatment as SubNav: an edge fade so a scrolling tab strip looks
 * scrollable, and the active tab scrolled into view. Thirteen TabsList mounts in
 * the app, several of which overflow well before phone widths.
 */
export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  const { ref, edges } = usePillOverflow<HTMLDivElement>();
  return (
    <PillOverflow edges={edges} className="w-fit max-w-full">
      <TabsPrimitive.List ref={ref} className={cn(tabsListClasses, className)} {...props} />
    </PillOverflow>
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        tabsTriggerClasses,
        'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />;
}
