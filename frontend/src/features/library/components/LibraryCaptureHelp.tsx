import { Dialog } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';

export function LibraryCaptureHelp({ onClose }: { onClose: () => void }) {
  return <Dialog title="Save from YouTube" onClose={onClose}>
    <div className="wk-lib-form">
      <h3>Desktop browser</h3>
      <p>The Save to Wukna extension adds Wukna to YouTube’s Share panel in Chrome, Opera, and Edge. Its toolbar button also saves the current YouTube video.</p>
      <ol className="wk-lib-capture-steps"><li><a className="wk-lib-link" href="/downloads/wukna-youtube-extension.zip" download>Download the extension</a> and extract it.</li>
        <li>Open your browser’s Extensions page, enable Developer mode, and choose Load unpacked. Select the extracted folder.</li>
        <li>In the extension’s settings, connect this Wukna address: <strong>{window.location.origin}</strong>.</li>
        <li>On YouTube, open Share and choose Wukna.</li></ol>
      <h3>Android YouTube app</h3>
      <p>Open your HTTPS Wukna address in a supported browser such as Chrome and install Wukna using Install app or Add to Home screen. In YouTube, tap Share, open the device’s app list if needed, and choose Wukna. If you are signed out, sign in to finish saving.</p>
      <p>Your device and browser control which installed apps appear. Localhost on your computer is not accessible from your phone. You can also drag a video link into Videos or use Save video link.</p>
      <div className="wk-dialog-actions"><Button onClick={onClose}>Done</Button></div>
    </div>
  </Dialog>;
}
