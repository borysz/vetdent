import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  lead?: string;
  children: React.ReactNode;
  /** Secondary links under the form (e.g. "No account yet? Sign up"). */
  footer?: React.ReactNode;
}

export function AuthCard({ title, lead, children, footer }: AuthCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </CardTitle>
        {lead ? <CardDescription className="text-base">{lead}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? (
        <CardFooter className="flex-col items-start gap-2 text-base text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  );
}
