import styles from "./logout-button.module.css";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const formClassName = [styles.form, className].filter(Boolean).join(" ");

  return (
    <form action="/api/auth/logout" method="post" className={formClassName}>
      <button type="submit" className={styles.button}>
        Log out
      </button>
    </form>
  );
}