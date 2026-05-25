import styles from "./logout-button.module.css";

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post" className={styles.form}>
      <button type="submit" className={styles.button}>
        Log out
      </button>
    </form>
  );
}