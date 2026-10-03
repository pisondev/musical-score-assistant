import { signInUrl, signOut, useAccount } from '../account';
import { GoogleIcon } from './icons';
import { Popover } from './Popover';

/** The picture of an account, or its first letter where Google gives none. */
function Avatar({ name, picture }: { name: string; picture?: string }) {
  return picture ? (
    <img className="avatar" src={picture} alt="" referrerPolicy="no-referrer" />
  ) : (
    <i className="avatar avatar--letter" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </i>
  );
}

/**
 * Signing in and out, at the right of the top bar. Shown only where one signs
 * in with Google; a development machine is its own owner and needs neither.
 */
export function AccountButton() {
  const status = useAccount((state) => state.status);
  const account = useAccount((state) => state.account);
  const signIn = useAccount((state) => state.signIn);
  if (status !== 'ready' || signIn !== 'google') return null;

  if (!account) {
    return (
      <a className="button account-signin" href={signInUrl()} title="Sign in with Google">
        <GoogleIcon width={17} height={17} />
        <span>Sign in</span>
      </a>
    );
  }

  return (
    <div className="account">
      <Popover
        label="Account"
        compact
        align="right"
        value={<Avatar name={account.name} picture={account.picture} />}
      >
        {() => (
          <div className="account-menu">
            <Avatar name={account.name} picture={account.picture} />
            <p className="account-menu__name">{account.name}</p>
            <p className="account-menu__email">{account.email}</p>
            <p className="menu__note">
              Your private songs, notes, favourites, recent songs, and settings are kept with this
              account, on every device you sign in on.
            </p>
            <button type="button" className="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}
