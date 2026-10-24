// The recipe file with 19 more made-up recipes, so the box is long enough to scroll and has more categories.
// The browser checks and the screenshots serve this in place of recipes/recipes.json where they say so.
const NAMES = ['Apple crisp', 'Banana bread', 'Beef stew', 'Chicken enchiladas', 'Chicken noodle soup', 'Chili mac',
  'Cornbread', 'French toast casserole', 'Ham and bean soup', 'Lasagna', 'Meatloaf', 'Pancakes', 'Pot roast',
  'Potato salad', "Shepherd's pie", 'Sloppy joes', 'Spaghetti and meatballs', 'Stuffed peppers', 'Taco soup'];
const TAGS = { 'Apple crisp': ['Dessert'], 'Banana bread': ['Dessert', 'Breakfast'], 'Beef stew': ['Crock pot'], 'Chicken noodle soup': ['Soup'],
  'French toast casserole': ['Breakfast'], 'Ham and bean soup': ['Soup', 'Crock pot'], 'Pancakes': ['Breakfast'], 'Pot roast': ['Crock pot'],
  'Taco soup': ['Soup'] };

module.exports = text => {
  const file = JSON.parse(text);
  for (const name of NAMES) {
    file.recipes.push({ id: name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-'), name, tags: TAGS[name] || [], ingredients: ['Made-up ingredient'], steps: [] });
  }
  return JSON.stringify(file, null, 2) + '\n';
};
