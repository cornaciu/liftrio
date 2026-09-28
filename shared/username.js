export function normalizeUsername(value) {
  return String(value ?? '').normalize('NFKC').trim().slice(0, 40).trim();
}

export function usernameTaken(users, username) {
  const key = normalizeUsername(username).toLocaleLowerCase('und');
  return users.some(user => normalizeUsername(user.name).toLocaleLowerCase('und') === key);
}
