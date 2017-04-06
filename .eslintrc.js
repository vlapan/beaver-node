module.exports = {
  "extends": "airbnb-base",
  "plugins": [
    "import"
  ],
  "rules": {
    "max-len": ["error", 999, 4],
    "indent": ["error", 4],
    "no-console": "off",
    "no-continue": "off",
    "no-underscore-dangle": "off",
    "no-bitwise": ["error", {
      "int32Hint": true,
      "allow": ["~"]
    }]
  }
};
