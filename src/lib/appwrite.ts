import { Account, Client, Databases, ID, Permission, Role } from "appwrite";

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID as string | undefined;

export const isAppwriteConfigured = Boolean(endpoint && projectId && endpoint.startsWith("http"));

export let client: Client | null = null;
export let account: Account | null = null;
export let databases: Databases | null = null;

if (isAppwriteConfigured) {
  client = new Client().setEndpoint(endpoint!).setProject(projectId!);
  account = new Account(client);
  databases = new Databases(client);
}

export { ID, Permission, Role };
