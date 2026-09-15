var moonlightPlugin;
var chromeHandle;
async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  chromeHandle = Components.classes['@mozilla.org/addons/addon-manager-startup;1']
    .getService(Components.interfaces.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(rootURI + 'manifest.json'),
      [['content', 'zotero-moonlight', rootURI + 'content/']]);
  Services.scriptloader.loadSubScript(rootURI + 'moonlight.js', this);
  moonlightPlugin = createMoonlightPlugin({ Zotero, Services, IOUtils, PathUtils,
    ChromeUtils, Components, DOMParser, URL, XMLHttpRequest, setTimeout, clearTimeout }, id);
  moonlightPlugin.start();
}
function onMainWindowLoad({ window }) { moonlightPlugin?.addWindow(window); }
function onMainWindowUnload({ window }) { moonlightPlugin?.removeWindow(window); }
function shutdown() {
  moonlightPlugin?.stop(); moonlightPlugin = undefined;
  chromeHandle?.destruct(); chromeHandle = undefined;
}
function install() {}
function uninstall() {}
