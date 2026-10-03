import { useState } from 'react';
import { dismissInstall, installDismissed, useInstall } from '../installed-app';
import { CloseIcon, NoteIcon, ShareIcon } from './icons';

/**
 * Offers to install the app where that is possible and it is not installed yet. Put away once,
 * the offer stays away on this device; the menu of the browser can still install the app.
 */
export function InstallCard() {
  const way = useInstall((state) => state.way);
  const install = useInstall((state) => state.install);
  const [dismissed, setDismissed] = useState(installDismissed);

  if (way === 'none' || dismissed) return null;

  const close = () => {
    dismissInstall();
    setDismissed(true);
  };

  return (
    <section className="card install" aria-label="Install the app">
      <span className="install__mark" aria-hidden="true">
        <NoteIcon width={22} height={22} />
      </span>
      <div className="install__text">
        <h2>Install the app</h2>
        {way === 'prompt' ? (
          <p>
            Open your scores from the home screen in a window of their own, with the whole screen
            for the music, and play them without a connection.
          </p>
        ) : (
          <p>
            Tap <ShareIcon className="install__share" width={15} height={15} /> <b>Share</b>, then{' '}
            <b>Add to Home Screen</b>: your scores open in a window of their own, with the whole
            screen for the music, and play without a connection.
          </p>
        )}
      </div>
      <div className="install__actions">
        {way === 'prompt' && (
          <button type="button" className="button button--solid" onClick={() => void install()}>
            Install
          </button>
        )}
        <button
          type="button"
          className="install__close"
          onClick={close}
          aria-label="Not now"
          title="Not now"
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>
    </section>
  );
}
