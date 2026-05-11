const fs = require('fs');
const photos = JSON.parse(fs.readFileSync(__dirname + '/photo-urls.json'));
const SKIP = /tripadvisor|happycow|mitvergnuegen|restaurantguru|alamy|dreamstime|pinimg|wixstatic|squarespace|wordpress|cloudinary|infatuation|dinnerunddrinks|cremeguides|loff\.it|technoedm|vivreaberlin|berlijn|berlintraveltips|fast-and-wide|barmag|hopfenhelden|bier-traveller|europeancoffeetrip|tasteandtea|endoedibles|top10berlin|urlaubspapa|pure-wanderlust|kuladig|geo\.de|oastatic|joinhalal|worldofmouth|mappde|out-the-box|sveapietschmann|qiez|peterstravel|ceecee|iconic-berlin|kulturnews|withberlinlove|nuberlin|libeskind|andershusa|iheartberlin|offen\.net|electrive|img\.restaurantguru|img3\.|halaltrip|atlasobscura|eventinc|cdn\.|s3-media|res\.cloudinary|media-cdn|c8\.alamy|l450v\.alamy/i;
const own = Object.entries(photos).filter(([, url]) => {
  if (!url) return false;
  try { return !SKIP.test(new URL(url).hostname); } catch { return false; }
});
console.log('Own/reliable-domain URLs:', own.length);
own.forEach(([name, url]) => { try { console.log(' ', name, '->', new URL(url).hostname); } catch {} });
