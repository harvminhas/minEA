/** True once per browser tab when the saved catalog is behind Postgres. */
export function shouldRefreshOnEnter(dirty: boolean, alreadyEntered: boolean): boolean {
  return dirty && !alreadyEntered;
}
