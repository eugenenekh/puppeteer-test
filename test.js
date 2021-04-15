const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: false, defaultViewport: null});
  const page = await browser.newPage();
  
  const numberOfSeats = 1;
  const basketDeepLink = `https://www.encoretickets.co.uk/booking/seating-plan?product_id=6362&content_product_id=6362&product_type=show&performance_type=E&venue_id=112&qt=${numberOfSeats}&slot=19:30&date=2021-07-30&booking_ends=2022-06-26&booking_starts=2021-06-24`;

  let availableAreas;
  let seats;
  page.on('response', async response => {
    if (response.url().includes('areas') && response.headers().allow) {
      const body = await response.json();
      availableAreas = body.response.areas;
      const randomSeats = await getRandomSeats(availableAreas, numberOfSeats);
      const randomSeatsForSeatsIO = await formatSeatsForSeatsIO(randomSeats);
      seats = randomSeatsForSeatsIO;
    }
  })

  await page.goto(basketDeepLink);
  await page.waitForXPath("//div[contains(@class,'spinner') and contains(., 'Finding Availability')]", {hidden: true});
  await page.waitForFunction('window.seatsio !== undefined && window.seatsio.charts.slice().pop() !== undefined');

  // add to basket
  const maxAttempts = 10;
  const addToBasket = async (seats, attempt = 0, areas = availableAreas) => {
    if (attempt === maxAttempts) {
      throw `Could not add to basket: attempts limit (${maxAttempts}) reached!`;
    } else {
      try {
        console.log(`Selecting seats ${seats}, attempt ${attempt + 1}.`);        
        await page.evaluate(`window.seatsio.charts.slice().pop().clearSelection();`);
        await page.evaluate(`window.seatsio.charts.slice().pop().selectSeats(${seats})`);
        const addToBasketBtn = await page.waitForSelector('.seat-summary__btn--submit', {timeout: 2000});
        console.log(`Seats ${seats} selected successfully. Adding to basket.`);    
        await addToBasketBtn.click();
      } catch (err) {
        console.log(`Seats ${seats} are not available. Selecting one more time.`);
        const randomSeats = await getRandomSeats(areas, numberOfSeats);
        const newSeats = await formatSeatsForSeatsIO(randomSeats);
        await addToBasket(newSeats, ++attempt);
      }
    }
  }
  await addToBasket(seats);

  //remove from basket
  const clearBasketBtn = await page.waitForSelector('.c-basket-product .o-btn--clear');
  await clearBasketBtn.click();
  await page.click('.o-alert .js-remove');

  //wait for confirmation
  await page.waitForXPath('//div[contains(text(),"Your basket is now empty")]');
  await page.waitForXPath('//h4[contains(text(),"Your basket is empty")]')
  
  await page.screenshot({path: 'example.png'});

  await browser.close();
})();

const getRandomSeats = async (areas, numberOfSeats) => {
  let allGroupings = [];
  for (const area of areas) {
    for (const grouping of area.groupings) {
      allGroupings.push(grouping);
    }
  }
  const allSeatIdentifiers = allGroupings
    .map(g => g.seats.map(s => s.seatIdentifier));

  const randomSeatsInGrouping = allSeatIdentifiers.filter(s => s.length >= numberOfSeats);
  const randomGroupingNumber = Math.floor(Math.random() * (randomSeatsInGrouping.length))
  const randomGrouping = randomSeatsInGrouping[randomGroupingNumber]

  const randomStartSeatIndex = Math.floor(Math.random() * (randomGrouping.length - numberOfSeats))
  const randomSeats = (await range(randomStartSeatIndex, randomStartSeatIndex + numberOfSeats, 1))
    .map(i => randomGrouping[i]);
  
  return randomSeats;
}

const range = async (start, stop, step) => Array.from({ length: (stop - start) / step }, (_, i) => start + (i * step));

const formatSeatsForSeatsIO = async (seats) => {
  const randomSeatsForSeatsIO = seats.map(s => {
    const seatRegex = /(\D+)(\d+)/;
    const res = s.match(seatRegex);
    return `${res[1]}-${res[2]}`
  }).map(s => s.replace('_', ' '));

  return JSON.stringify(randomSeatsForSeatsIO);
}