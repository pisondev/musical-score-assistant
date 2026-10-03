import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteAccount,
  PRIVACY_URL,
  signInUrl,
  signOut,
  TERMS_URL,
  useAccount,
  type AccountInfo,
} from '../account';
import { Dialog } from './Dialog';
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

/** Asks before the account and everything kept for it are removed for good. */
function DeleteAccountDialog({ account, onClose }: { account: AccountInfo; onClose: () => void }) {
  const [state, setState] = useState<'asking' | 'deleting' | 'failed'>('asking');
  const confirm = async () => {
    setState('deleting');
    try {
      await deleteAccount();
    } catch {
      setState('failed');
    }
  };

  return (
    <Dialog
      title="Delete account"
      detail={account.email}
      label="Delete the account"
      onClose={onClose}
    >
      <p className="dialog__lead">
        This removes your account from the site: your favourites, recent songs, and settings
        {account.role === 'member' && ', and your comments with their answers'}. It cannot be
        undone. Signing in with Google again later starts a new, empty account.
      </p>
      {state === 'failed' && (
        <p className="dialog__note dialog__note--error">
          The account could not be deleted. Check the connection and try again.
        </p>
      )}
      <footer className="dialog__foot">
        <div className="dialog__buttons">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--danger"
            disabled={state === 'deleting'}
            onClick={() => void confirm()}
          >
            {state === 'deleting' ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </footer>
    </Dialog>
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
  const [deleting, setDeleting] = useState(false);
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
        {(close) => (
          <div className="account-menu">
            <Avatar name={account.name} picture={account.picture} />
            <p className="account-menu__name">{account.name}</p>
            <p className="account-menu__email">{account.email}</p>
            <p className="menu__note">
              {account.role === 'owner'
                ? 'Your licensed songs, notes, favourites, recent songs, and settings are kept with this account, on every device you sign in on.'
                : 'Your favourites, recent songs, and settings are kept with this account, on every device you sign in on.'}
            </p>
            <button type="button" className="button" onClick={() => void signOut()}>
              Sign out
            </button>
            <p className="account-menu__links">
              <a href={PRIVACY_URL}>Privacy</a>
              <a href={TERMS_URL}>Terms</a>
              <button
                type="button"
                className="account-menu__delete"
                onClick={() => {
                  close();
                  setDeleting(true);
                }}
              >
                Delete account…
              </button>
            </p>
          </div>
        )}
      </Popover>
      {/* Outside the top bar, whose blurred backdrop would hold a fixed dialog inside it. */}
      {deleting &&
        createPortal(
          <DeleteAccountDialog account={account} onClose={() => setDeleting(false)} />,
          document.body,
        )}
    </div>
  );
}
