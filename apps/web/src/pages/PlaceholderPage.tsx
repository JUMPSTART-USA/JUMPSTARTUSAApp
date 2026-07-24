import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Temporary stub while module screens are under construction. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming together</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This module&apos;s screens are being built. The API behind it is already live.
        </CardContent>
      </Card>
    </div>
  );
}
