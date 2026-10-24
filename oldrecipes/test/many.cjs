// The recipe file with 19 more made-up recipes, so the list is long enough to scroll and pile up at the top.
// The browser checks and the screenshots serve this in place of recipes/recipes.json where they say so.
const NAMES = ['Apple crisp', 'Banana bread', 'Beef stew', 'Chicken enchiladas', 'Chicken noodle soup', 'Chili mac',
  'Cornbread', 'French toast casserole', 'Ham and bean soup', 'Lasagna', 'Meatloaf', 'Pancakes', 'Pot roast',
  'Potato salad', "Shepherd's pie", 'Sloppy joes', 'Spaghetti and meatballs', 'Stuffed peppers', 'Taco soup'];

module.exports = text => {
  const file = JSON.parse(text);
  for (const name of NAMES) {
    file.recipes.push({ id: name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-'), name, tags: [], ingredients: ['Made-up ingredient'], steps: [] });
  }
  return JSON.stringify(file, null, 2) + '\n';
};
