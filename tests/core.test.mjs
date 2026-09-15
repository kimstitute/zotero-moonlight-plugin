import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/core.ts';

const base = {libraryID: 1, itemKey: 'ABCD1234', title:'Sample', attachments: []};
test('web addresses reject credentials, executable schemes and control characters', () => {
  for (const url of ['javascript:alert(1)', 'file:///private.pdf', 'https://a:b@example.org/x', 'https://example.org/\nx']) assert.equal(c.webURL(url), null);
  assert.equal(c.webURL('../paper.pdf', 'https://example.org/a/b/'), 'https://example.org/a/paper.pdf');
});
test('DOI URLs preserve reserved characters in the DOI without treating them as a query', () => {
  assert.equal(c.doiURL('doi:10.1234/abc?x#y'), 'https://doi.org/10.1234/abc%3Fx%23y');
  assert.equal(c.normalizeDOI('https://doi.org/10.1234%2Ftest'), '10.1234/test');
  assert.equal(c.doiURL('not a DOI'), null);
});
test('arXiv new and legacy identifiers retain exact versions', () => {
  assert.equal(c.arxivPDF('https://arxiv.org/abs/1706.03762v7'), 'https://arxiv.org/pdf/1706.03762v7');
  assert.equal(c.arxivPDF('https://arxiv.org/pdf/hep-th/9901001v2.pdf'), 'https://arxiv.org/pdf/hep-th/9901001v2');
  assert.equal(c.arxivPDF('https://doi.org/10.48550/arXiv.1706.03762'), 'https://arxiv.org/pdf/1706.03762');
  assert.equal(c.arxivPDF('https://arxiv.org.evil.example/abs/1706.03762'), null);
  assert.equal(c.arxivPDF('https://arxiv.org/abs/../../private'), null);
});
test('online URL with no attachment produces a candidate without invoking network inspection', async () => {
  const result = await c.resolveSources({...base, itemURL:'https://example.org/paper.pdf'}, () => {throw Error('should not inspect');});
  assert.equal(result.candidates[0].url, 'https://example.org/paper.pdf');
});
test('arXiv and arXiv DOI work without attachments or fetching a landing page', async () => {
  for (const field of [{itemURL:'https://arxiv.org/abs/1706.03762v3'}, {doi:'10.48550/arXiv.1706.03762v3'}]) {
    const result = await c.resolveSources({...base,...field}, () => {throw Error('unexpected');});
    assert.equal(result.candidates[0].url, 'https://arxiv.org/pdf/1706.03762v3');
  }
});
test('attachment MIME type alone does not turn a publisher landing page into a PDF URL', () => {
  const result = c.planSources({...base, attachments:[{url:'https://publisher.test/article/1', label:'PDF', pdf:true}]});
  assert.equal(result.direct.length, 0);
  assert.equal(result.pages.length, 1);
});
test('an explicitly selected direct PDF takes precedence over sibling versions', () => {
  const result=c.planSources({...base, selected:{url:'https://example.org/supplement.pdf',label:'Selected'},
    itemURL:'https://example.org/main.pdf',attachments:[{url:'https://example.org/other.pdf',label:'Other'}]});
  assert.deepEqual(result.direct.map(x=>x.url),['https://example.org/supplement.pdf']);
});
test('signed PDF query string is preserved and duplicate URLs are collapsed', () => {
  const url = 'https://example.org/a.pdf?X-Amz-Signature=abc%2Fxyz&x=2';
  const result = c.planSources({...base,itemURL:url,attachments:[{url,label:'same'}]});
  assert.equal(result.direct.length, 1); assert.equal(result.direct[0].url,url);
});
test('publisher failure falls back to DOI and explicit PDF metadata', async () => {
  const visited = [];
  const result = await c.resolveSources({...base,itemURL:'https://publisher.test/blocked',doi:'10.1234/a'}, async url => {
    visited.push(url); if (!url.includes('doi.org')) throw Error('timeout');
    return [{url:'https://cdn.test/download?id=1',label:'metadata',pdf:true}];
  });
  assert.equal(visited.length,2);
  assert.equal(result.candidates[0].url,'https://cdn.test/download?id=1');
});
test('all blocked pages return a source-page fallback, not a fabricated PDF', async () => {
  const result = await c.resolveSources({...base,itemURL:'https://publisher.test/private',doi:'10.1234/a'}, async () => []);
  assert.equal(result.candidates.length,0); assert.equal(result.pages.length,2);
});
test('metadata handles relative links, base URL, unquoted DOM attributes and unsafe schemes', () => {
  const node = (attrs,text='') => ({getAttribute:k=>attrs[k]??null,textContent:text});
  const doc = {querySelector:()=>node({href:'/papers/'}),querySelectorAll:selector=> selector.startsWith('meta')
    ? [node({name:'CITATION_PDF_URL',content:'./a.pdf'}),node({name:'citation_pdf_url',content:'javascript:bad()'})]
    : [node({type:'application/pdf',href:'https://cdn.test/b?id=2'},'Accepted manuscript')]};
  assert.deepEqual(c.metadataPDFs(doc,'https://publisher.test/redirected/article').map(x=>x.url), ['https://publisher.test/papers/a.pdf','https://cdn.test/b?id=2']);
});
test('browser arguments preserve URLs as a single argument without a shell', () => {
  const url='https://example.org/p.pdf?q=%22%20--bad&next=x';
  assert.deepEqual(c.browserArgs(url,'Profile 2'),['--profile-directory=Profile 2','--new-tab',url]);
  assert.throws(()=>c.browserArgs(url,'Default --bad'));
  assert.throws(()=>c.browserArgs('file:///C:/p.pdf'));
  assert.deepEqual(c.browserArgs('file:///C:/a%20b.pdf','',true),['--new-tab','file:///C:/a%20b.pdf']);
});
test('document links accept only Moonlight HTTPS addresses', () => {
  assert.equal(c.moonlightURL('https://www.themoonlight.io/paper/share/abc'),'https://www.themoonlight.io/paper/share/abc');
  for (const url of ['http://www.themoonlight.io/paper/1','https://www.themoonlight.io.attacker.org/paper/1','https://evil@www.themoonlight.io/paper/1']) assert.equal(c.moonlightURL(url),null);
});
test('internal reader wraps the PDF URL exactly once and retains existing Moonlight links', () => {
  const source='https://cdn.test/p.pdf?token=a%2Fb&x=3#page=2';
  const target=c.moonlightReaderURL(source);
  assert.equal(new URL(target).searchParams.get('url'),source);
  assert.equal(c.moonlightReaderURL(target),target);
  assert.equal(c.moonlightReaderURL('https://www.themoonlight.io/paper/123'),'https://www.themoonlight.io/paper/123');
  assert.throws(()=>c.moonlightReaderURL('file:///C:/paper.pdf'));
});
test('library IDs distinguish identical item keys and corrupt links fail without overwriting', () => {
  assert.notEqual(c.linkKey(1,'ABCD1234'),c.linkKey(2,'ABCD1234'));
  assert.throws(()=>c.linkKey(1,'../oops'));
  assert.throws(()=>c.readLinks('{broken'));
  assert.throws(()=>c.readLinks('{"schema":2,"entries":{}}'));
  assert.deepEqual(c.readLinks(),{schema:1,entries:{}});
});
