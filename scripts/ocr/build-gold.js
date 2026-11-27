/* Gold labels for the 40 handwritten card photos. Canonical values are what the reader should produce. */
'use strict';
const fs = require('fs');
const path = require('path');

const TANKS = 17;
const cm = ['0','0','0','350','0','432','222','182','460','44','144','4','317','317','316','266','174'];
const temp = ['29','29','29','30','29','84','86','96','79','67','29','29','29','29','29','29','29'];

function sounding(over) {
  const fields = {
    date: '13/11/2026', time: '09:00', fwd: '13.92', aft: '14.45', trim: '0.53', sea: '30', er: '42'
  };
  cm.forEach((v, i) => { fields['cm:' + i] = v; });
  temp.forEach((v, i) => { fields['temp:' + i] = v; });
  const boxes = {};
  for (let i = 0; i < TANKS; i++) {
    boxes['ullage:' + i] = i < 9;
    boxes['depth:' + i] = i >= 9;
  }
  Object.assign(fields, over.fields || {});
  if (over.temp16) fields['temp:16'] = over.temp16;
  if (over.time) fields.time = over.time;
  if (over.date) fields.date = over.date;
  if (over.emptyZeros) ['0','1','2','4'].forEach((i) => { fields['cm:' + i] = '0'; });
  if (over.noTicks) { Object.keys(boxes).forEach((k) => { boxes[k] = false; }); }
  return { kind: 'sounding', rotated: !!over.rotated, fields, boxes, unsure: over.unsure || [], by: over.by || '' };
}

function log(over) {
  const f = {
    operation: 'NOON', dist: '234', windDir: 'NE', windBft: '5', seaState: 'VERY ROUGH',
    erTemp: '35', stTemp: '36', seaTemp: '25',
    'fm:me': '4981210', 'fm:ge:in': '2363120', 'fm:ge:out': '9945940', 'fm:blr': '161942', 'fm:cyl': '76154', 'fm:rev': '02979363000', 'fm:fw': '27110',
    'rack:1': '62', 'rack:2': '59', 'rack:3': '56', 'rack:4': '57', 'rack:5': '64', 'rack:6': '55',
    'exh:1': '310', 'exh:2': '310', 'exh:3': '290', 'exh:4': '305', 'exh:5': '280', 'exh:6': '320',
    't:1:in': '340', 't:1:out': '250', 't:1:rpm': '12014',
    scavTemp: '40', scavPress: '1.5', acIn: '34', acOut: '42', pressDiff: '', fuelTemp: '124', pumpMark: '41', meLoTemp: '45', meLoPress: '3.4',
    'ge:1:svc': '20', 'ge:1:hrs': '65901', 'ge:1:kw': '243',
    'ge:2:svc': '', 'ge:2:hrs': '60140', 'ge:2:kw': '243',
    'ge:3:svc': '23', 'ge:3:hrs': '64225', 'ge:3:kw': '242',
    'blr:hrs': '', 'blr:kw': '', 'inc:hrs': '', 'inc:kw': '',
    bilgeRob: '13.927', sludgeRob: '16.555', fwRob: '112/111',
    datetime: '17/11/2026 12:00'
  };
  Object.assign(f, over.fields || {});
  return { kind: 'log', rotated: !!over.rotated, fields: f, boxes: {}, unsure: over.unsure || [] };
}

const B = { fields: { 'fm:rev': '297363000', 't:1:in': '346', pressDiff: '0.16', meLoPress: '3.1', bilgeRob: '13.9', sludgeRob: '16.6', 'ge:2:svc': '3', 'ge:2:kw': '238', datetime: '17/11/2026 12:00' } };
const C = { fields: { 'fm:rev': '0297363000', pressDiff: '0.16', bilgeRob: '13.92', sludgeRob: '16.55', 'ge:2:svc': '3', 'ge:2:kw': '238' } };

const cards = {};
function put(id, rec) { cards[id + '.jpg'] = rec; }

/* log, the 13.927 / 3.4 noon card */
['07d5e702175276c0d0e119bd24a36e2b89fca7332445bbc7820b454744512f13',
 '0e61e54b9b5352ca900b5ecaf980f7bca3a9518d84782dc4e74b4c61a0b5103b',
 '2017ec0275075206d4ec3f3cc47753a29466155e03f4130cfc5f97c3788614d7',
 'c32c57fc9f4a427c7f3f978ec279443cc40ec4c0d21e8da85e84beca7680f475',
 '57d0fe0f658e53817c1325e37bb55a74b3d61e64bfbe2d39f9cbdf446a4e283e'
].forEach((id) => put(id, log({ fields: { datetime: '17/11/2026 12:00' } })));

['9e714f80aa6d0d00b45e2441f93493477cf33400ee84621f3898abe34d478a89',
 'a78232c0e59ff15e0e0c64268039941f8f135b9c9a10f3ce6c6e0c238a3daf69',
 'a99ca5d8e85d45fc1fcadb318c5687f190977ca3cf5925b41dedc40abe4c297d',
 'bae3d43d843c49703396306e2260dbb9d4b7051f13d1052a554ea4a9c661ba5c',
 '9cfc0dd5168a7364987f4512ea285bac3697c66888a6f9d92170c3da88c31dc1',
 'aec5b7a2fae4923f407e915e539f95e487e651cec32c774c37271df168231145',
 'db6322d14e3d416754ead7b34cb4cbfe4d59e07617492c28814d7b49625ff442'
].forEach((id) => put(id, log({ fields: { datetime: '17/11/2026 12:00', fwRob: '112/111=223', 'fm:rev': '0297363000' }, rotated: /9cfc|aec5|db63/.test(id) })));
/* 9e71 a782 a99c bae3 were read with the leading-9 rev and =223 and ge2 kw 243. The three rotated ones were read with 0297363000 and ge2 kw blank. Split them. */
['9e714f80aa6d0d00b45e2441f93493477cf33400ee84621f3898abe34d478a89',
 'a78232c0e59ff15e0e0c64268039941f8f135b9c9a10f3ce6c6e0c238a3daf69',
 'a99ca5d8e85d45fc1fcadb318c5687f190977ca3cf5925b41dedc40abe4c297d',
 'bae3d43d843c49703396306e2260dbb9d4b7051f13d1052a554ea4a9c661ba5c'
].forEach((id) => put(id, log({ fields: { datetime: '17/11/2026 12:00', fwRob: '112/111=223' } })));
['9cfc0dd5168a7364987f4512ea285bac3697c66888a6f9d92170c3da88c31dc1',
 'aec5b7a2fae4923f407e915e539f95e487e651cec32c774c37271df168231145',
 'db6322d14e3d416754ead7b34cb4cbfe4d59e07617492c28814d7b49625ff442'
].forEach((id) => put(id, log({ rotated: true, fields: { datetime: '17/11/2026 12:00', 'fm:rev': '0297363000', 'ge:2:kw': '' } })));

put('783bfbcaa973b096a36ee81eb8109777fbe84cbacccc44f62bd331edd6065802', log({
  fields: { datetime: '17/11/2026 12:00', fwRob: '112/111=223' },
  unsure: ['datetime']
}));

/* 3.1 / 13.9 hand, including the one exhaust of 580 */
put('21d8323e34a80627cc7df30219a852145fe60d72c79c81d7f63852b005ec2204', log({ fields: Object.assign({}, B.fields, { datetime: '17/11/2026 12:00' }) }));
put('53d26cf20a4098598ec1cfe469362b5644dc9699c75d2a74b804f78d026827fb', log({ fields: Object.assign({}, B.fields, { 't:1:in': '340', 'rack:4': '37', 'exh:5': '580' }) }));
put('afd81de00ffddd13099df6a7072e7b0ddc9562d12a6d10004c2b5e1d1ec05c6b', log({ fields: Object.assign({}, B.fields, { 't:1:in': '340', 'rack:4': '37', datetime: '17/11/2026 12:00' }) }));

/* 13.92 hand */
put('14324a03ece1195b47fb553f773374ba1f16813f7a4d6d5d3813e1db00214618', log({ fields: Object.assign({}, C.fields, { datetime: '17/11/2026 14:00' }) }));
put('441ba733324366adac86b76f075a040791b1be3da3039d34a822cc3eb6ba334b', log({ fields: Object.assign({}, C.fields, { datetime: '17/11/2026 12:00', stTemp: '34' }) }));
put('44d278c49b58c94a4a70257a7e95041dc4073f92e22824ba96a05490044a14b6', log({ rotated: true, fields: Object.assign({}, C.fields, { datetime: '17/11/2026 12:00' }) }));
put('6de9c1c87918eb77ce84295a463d52dadba026d977efd98d18c349e4a9db43b7', log({ rotated: true, fields: Object.assign({}, C.fields, { datetime: '17/11/2026 12:00' }) }));
put('b70e64642b3c5cd4f2a3666d2a2d5206ec09d25de23dda9f9a5ce2c1c366b75c', log({ rotated: true, fields: Object.assign({}, C.fields, { datetime: '17/11/2026 12:00' }) }));
put('a654715ebe9e26c856ebf1660d8a6a2984497df4834ba20c8ebdf471b0644106', log({
  rotated: true,
  fields: Object.assign({}, C.fields, { datetime: '17/11/2026 12:00', seaTemp: '26', 'ge:2:kw': '278' }),
  unsure: ['seaTemp', 'ge:2:kw', 'fm:ge:out']
}));

/* soundings */
function S(id, over) { put(id, sounding(over || {})); }
S('0ce690357c87d4f5393a46c6f950011b32670aa3c643827c28315d271a603aa6', { time: '08:00', temp16: '42' });
S('147bdd70263ad62c7add354ed1f97c7c2968e7e5f555e7f12e9b0887a5724677', { unsure: ['temp:16'] });
S('3622bce6e13089e1a1adf708392c1003cb8fd5151fa7a9182a1e60b8e164289d', { time: '08:00', temp16: '42' });
S('5e82eb4863c03cb85bd4d8135005cbcde2e5b00d84e476e5655ca6a28f479c76');
S('ddd639b39d26f23f97688d9d75d6df8a57ea62bd47ce8fbb714b895e5de0703f', { emptyZeros: true });
S('de64080cc309579ea78d3e1f3e6256fb1377d47bb38d84d32debc5358a4fd9da', { emptyZeros: true });
S('e1f2ec80bffaea9c8594eb4d5be61379f2078f4d32997072f6300c83a0718d3f', { time: '08:00', date: '13/11/2026', temp16: '42', noTicks: true });
S('e270bfec97202451e1a2b6a23c593290323fd06e5c91a17e9e13973facffe805');
S('03a2892318207f046ae62f4e01b157d9de91c06dc17acbab2542b3a58d6dfaf9');
S('06caad4b6759dda4177d17da1d3ec46e55a60fd4165ae6c1537ab7285d8f170c');
S('2e1f00effa39243aac82d9283dcca449b93302a361f1cf784beb9054b5cb6250', { rotated: true, time: '09:00' });
S('34579a7766329505c87c263a6cbd9e43bbb7d929746bdab9c83d5eee4732669b', { rotated: true, time: '09:00' });
S('5ab3f860b144bfd3bbe471dd3b2a0f722d4d3715a39413fcfc36bddae8559399', { rotated: true, unsure: ['aft'] });
S('5aca38c9c70385e92cd2995739f57c49fa4ce2c130cd0f1763e51202ca67e996', { rotated: true });
S('5d0944fea60b8bc8e08dc95a36b2747686e99620d0cd6c9c0180dd0196443087', { rotated: true });
S('7ea9dfb9596bf4cdffb2e76ff8ff22b68bda413dff4bdda267e91b4b433d23e8', { rotated: true, time: '09:00' });
S('82e67d6ab75015bd3ab7e420ba9f6b99d9b1867162ddfebff80aebe2449098f9', { rotated: true });
S('f613f642781e74c6beb26454d437e34031759a3dc1831cc738525346592a147f');

const test = [
  '6de9c1c87918eb77ce84295a463d52dadba026d977efd98d18c349e4a9db43b7.jpg',
  '2e1f00effa39243aac82d9283dcca449b93302a361f1cf784beb9054b5cb6250.jpg',
  '44d278c49b58c94a4a70257a7e95041dc4073f92e22824ba96a05490044a14b6.jpg',
  '53d26cf20a4098598ec1cfe469362b5644dc9699c75d2a74b804f78d026827fb.jpg',
  '5ab3f860b144bfd3bbe471dd3b2a0f722d4d3715a39413fcfc36bddae8559399.jpg',
  '07d5e702175276c0d0e119bd24a36e2b89fca7332445bbc7820b454744512f13.jpg',
  'ddd639b39d26f23f97688d9d75d6df8a57ea62bd47ce8fbb714b895e5de0703f.jpg',
  '783bfbcaa973b096a36ee81eb8109777fbe84cbacccc44f62bd331edd6065802.jpg',
  'e1f2ec80bffaea9c8594eb4d5be61379f2078f4d32997072f6300c83a0718d3f.jpg',
  'b70e64642b3c5cd4f2a3666d2a2d5206ec09d25de23dda9f9a5ce2c1c366b75c.jpg'
];

const names = Object.keys(cards);
if (names.length !== 40) {
  console.error('expected 40 cards, got ' + names.length);
  process.exit(1);
}
const gold = {
  note: 'Canonical values. Empty soundings are 0. Times are HH:MM. Dates are DD/MM/YYYY. FW may include =total. unsure fields are not scored.',
  test: test,
  cards: cards
};
const out = path.join(__dirname, '../fixtures/card-gold.json');
fs.writeFileSync(out, JSON.stringify(gold, null, 1));
console.log('wrote', names.length, 'cards,', test.length, 'held out');
