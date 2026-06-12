// Small client-side sign-out button. Wraps the server action in a form so
// the button can live inside any layout.

import { signOut } from "@/app/login/actions";
import { Button } from "./Button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button variant="secondary" size="sm" type="submit">
        Sign out
      </Button>
    </form>
  );
}
