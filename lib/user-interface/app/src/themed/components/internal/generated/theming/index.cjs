module.exports.preset = {
  "theme": {
    "id": "visual-refresh",
    "selector": ":root",
    "modes": {
      "color": {
        "id": "color",
        "states": {
          "light": {
            "default": true
          },
          "dark": {
            "selector": ".awsui-dark-mode",
            "media": "not print"
          }
        }
      },
      "density": {
        "id": "density",
        "states": {
          "comfortable": {
            "default": true
          },
          "compact": {
            "selector": ".awsui-compact-mode"
          }
        }
      },
      "motion": {
        "id": "motion",
        "states": {
          "default": {
            "default": true
          },
          "disabled": {
            "selector": ".awsui-motion-disabled"
          }
        }
      }
    },
    "tokens": {
      "colorAmazonOrange": "#ff9900",
      "colorAwsSquidInk": "#232f3e",
      "colorBlack": "#000000",
      "colorBlue100": "#f0fbff",
      "colorBlue200": "#d1f1ff",
      "colorBlue300": "#b8e7ff",
      "colorBlue400": "#75cfff",
      "colorBlue500": "#42b4ff",
      "colorBlue600": "#006ce0",
      "colorBlue700": "#004a9e",
      "colorBlue800": "#002b66",
      "colorBlue900": "#001129",
      "colorBlueOpaque": "rgba(51, 136, 221, 0.5)",
      "colorGreen100": "#effff1",
      "colorGreen500": "#2bb534",
      "colorGreen600": "#00802f",
      "colorGreen700": "#00471e",
      "colorGreen900": "#001401",
      "colorGrey100": "#f9f9fa",
      "colorGrey125": "#f6f6f9",
      "colorGrey150": "#f3f3f7",
      "colorGrey200": "#ebebf0",
      "colorGrey300": "#dedee3",
      "colorGrey350": "#c6c6cd",
      "colorGrey400": "#b4b4bb",
      "colorGrey450": "#a4a4ad",
      "colorGrey500": "#8c8c94",
      "colorGrey550": "#656871",
      "colorGrey600": "#424650",
      "colorGrey650": "#333843",
      "colorGrey700": "#232b37",
      "colorGrey750": "#1b232d",
      "colorGrey800": "#161d26",
      "colorGrey850": "#131920",
      "colorGrey900": "#0f141a",
      "colorGrey950": "#06080a",
      "colorOrange100": "#fef6f0",
      "colorOrange500": "#ec7211",
      "colorOrange600": "#eb5f07",
      "colorOrange700": "#dd6b10",
      "colorPurple400": "#bf80ff",
      "colorPurple600": "#7300e5",
      "colorRed100": "#fff5f5",
      "colorRed500": "#ff7a7a",
      "colorRed600": "#db0000",
      "colorRed700": "#700000",
      "colorRed900": "#1f0000",
      "colorTransparent": "transparent",
      "colorWhite": "#ffffff",
      "colorYellow100": "#fffef0",
      "colorYellow600": "#ffe347",
      "colorYellow700": "#fbd332",
      "colorYellow800": "#855900",
      "colorYellow900": "#191100",
      "colorChartsRed300": {
        "light": "#ea7158",
        "dark": "#d63f38"
      },
      "colorChartsRed400": {
        "light": "#dc5032",
        "dark": "#ed5958"
      },
      "colorChartsRed500": {
        "light": "#d13313",
        "dark": "#fe6e73"
      },
      "colorChartsRed600": {
        "light": "#ba2e0f",
        "dark": "#ff8a8a"
      },
      "colorChartsRed700": {
        "light": "#a82a0c",
        "dark": "#ffa09e"
      },
      "colorChartsRed800": {
        "light": "#972709",
        "dark": "#ffb3b0"
      },
      "colorChartsRed900": {
        "light": "#892407",
        "dark": "#ffc4c0"
      },
      "colorChartsRed1000": {
        "light": "#7d2105",
        "dark": "#ffd2cf"
      },
      "colorChartsRed1100": {
        "light": "#721e03",
        "dark": "#ffe0dd"
      },
      "colorChartsRed1200": {
        "light": "#671c00",
        "dark": "#ffecea"
      },
      "colorChartsOrange300": {
        "light": "#e07941",
        "dark": "#c55305"
      },
      "colorChartsOrange400": {
        "light": "#cc5f21",
        "dark": "#de6923"
      },
      "colorChartsOrange500": {
        "light": "#bc4d01",
        "dark": "#f27c36"
      },
      "colorChartsOrange600": {
        "light": "#a84401",
        "dark": "#f89256"
      },
      "colorChartsOrange700": {
        "light": "#983c02",
        "dark": "#fca572"
      },
      "colorChartsOrange800": {
        "light": "#8a3603",
        "dark": "#ffb68b"
      },
      "colorChartsOrange900": {
        "light": "#7e3103",
        "dark": "#ffc6a4"
      },
      "colorChartsOrange1000": {
        "light": "#732c02",
        "dark": "#ffd4bb"
      },
      "colorChartsOrange1100": {
        "light": "#692801",
        "dark": "#ffe1cf"
      },
      "colorChartsOrange1200": {
        "light": "#602400",
        "dark": "#ffede2"
      },
      "colorChartsYellow300": {
        "light": "#b2911c",
        "dark": "#977001"
      },
      "colorChartsYellow400": {
        "light": "#9c7b0b",
        "dark": "#b08400"
      },
      "colorChartsYellow500": {
        "light": "#8a6b05",
        "dark": "#c59600"
      },
      "colorChartsYellow600": {
        "light": "#7b5f04",
        "dark": "#d3a61c"
      },
      "colorChartsYellow700": {
        "light": "#6f5504",
        "dark": "#dfb52c"
      },
      "colorChartsYellow800": {
        "light": "#654d03",
        "dark": "#eac33a"
      },
      "colorChartsYellow900": {
        "light": "#5d4503",
        "dark": "#f1cf65"
      },
      "colorChartsYellow1000": {
        "light": "#553f03",
        "dark": "#f7db8a"
      },
      "colorChartsYellow1100": {
        "light": "#4d3901",
        "dark": "#fce5a8"
      },
      "colorChartsYellow1200": {
        "light": "#483300",
        "dark": "#ffefc9"
      },
      "colorChartsGreen300": {
        "light": "#67a353",
        "dark": "#48851a"
      },
      "colorChartsGreen400": {
        "light": "#41902c",
        "dark": "#5a9b29"
      },
      "colorChartsGreen500": {
        "light": "#1f8104",
        "dark": "#69ae34"
      },
      "colorChartsGreen600": {
        "light": "#1a7302",
        "dark": "#7dbd4c"
      },
      "colorChartsGreen700": {
        "light": "#176702",
        "dark": "#8fca61"
      },
      "colorChartsGreen800": {
        "light": "#145d02",
        "dark": "#9fd673"
      },
      "colorChartsGreen900": {
        "light": "#125502",
        "dark": "#b2df8d"
      },
      "colorChartsGreen1000": {
        "light": "#104d01",
        "dark": "#c5e7a8"
      },
      "colorChartsGreen1100": {
        "light": "#0f4601",
        "dark": "#d5efbe"
      },
      "colorChartsGreen1200": {
        "light": "#0d4000",
        "dark": "#e4f7d5"
      },
      "colorChartsTeal300": {
        "light": "#2ea597",
        "dark": "#018977"
      },
      "colorChartsTeal400": {
        "light": "#1c8e81",
        "dark": "#009d89"
      },
      "colorChartsTeal500": {
        "light": "#0d7d70",
        "dark": "#00b09b"
      },
      "colorChartsTeal600": {
        "light": "#096f64",
        "dark": "#40bfa9"
      },
      "colorChartsTeal700": {
        "light": "#06645a",
        "dark": "#5fccb7"
      },
      "colorChartsTeal800": {
        "light": "#045b52",
        "dark": "#77d7c3"
      },
      "colorChartsTeal900": {
        "light": "#03524a",
        "dark": "#94e0d0"
      },
      "colorChartsTeal1000": {
        "light": "#014b44",
        "dark": "#ace9db"
      },
      "colorChartsTeal1100": {
        "light": "#01443e",
        "dark": "#c2f0e6"
      },
      "colorChartsTeal1200": {
        "light": "#003e38",
        "dark": "#d7f7f0"
      },
      "colorChartsBlue1300": {
        "light": "#529ccb",
        "dark": "#00819c"
      },
      "colorChartsBlue1400": {
        "light": "#3184c2",
        "dark": "#0497ba"
      },
      "colorChartsBlue1500": {
        "light": "#0273bb",
        "dark": "#08aad2"
      },
      "colorChartsBlue1600": {
        "light": "#0166ab",
        "dark": "#44b9dd"
      },
      "colorChartsBlue1700": {
        "light": "#015b9d",
        "dark": "#63c6e7"
      },
      "colorChartsBlue1800": {
        "light": "#015292",
        "dark": "#79d2f0"
      },
      "colorChartsBlue1900": {
        "light": "#014a87",
        "dark": "#98dcf5"
      },
      "colorChartsBlue11000": {
        "light": "#01437d",
        "dark": "#b3e4f8"
      },
      "colorChartsBlue11100": {
        "light": "#003c75",
        "dark": "#caedfc"
      },
      "colorChartsBlue11200": {
        "light": "#00366d",
        "dark": "#ddf4ff"
      },
      "colorChartsBlue2300": {
        "light": "#688ae8",
        "dark": "#486de8"
      },
      "colorChartsBlue2400": {
        "light": "#5978e3",
        "dark": "#6384f5"
      },
      "colorChartsBlue2500": {
        "light": "#4066df",
        "dark": "#7698fe"
      },
      "colorChartsBlue2600": {
        "light": "#3759ce",
        "dark": "#8ea9ff"
      },
      "colorChartsBlue2700": {
        "light": "#314fbf",
        "dark": "#a2b8ff"
      },
      "colorChartsBlue2800": {
        "light": "#2c46b1",
        "dark": "#b1c5ff"
      },
      "colorChartsBlue2900": {
        "light": "#273ea5",
        "dark": "#c3d1ff"
      },
      "colorChartsBlue21000": {
        "light": "#23379b",
        "dark": "#d2dcff"
      },
      "colorChartsBlue21100": {
        "light": "#1f3191",
        "dark": "#dfe6ff"
      },
      "colorChartsBlue21200": {
        "light": "#1b2b88",
        "dark": "#ecf0ff"
      },
      "colorChartsPurple300": {
        "light": "#a783e1",
        "dark": "#8d59de"
      },
      "colorChartsPurple400": {
        "light": "#9469d6",
        "dark": "#a173ea"
      },
      "colorChartsPurple500": {
        "light": "#8456ce",
        "dark": "#b088f5"
      },
      "colorChartsPurple600": {
        "light": "#7749bf",
        "dark": "#bf9bf9"
      },
      "colorChartsPurple700": {
        "light": "#6b40b2",
        "dark": "#cbabfc"
      },
      "colorChartsPurple800": {
        "light": "#6237a7",
        "dark": "#d6baff"
      },
      "colorChartsPurple900": {
        "light": "#59309d",
        "dark": "#dfc8ff"
      },
      "colorChartsPurple1000": {
        "light": "#512994",
        "dark": "#e8d5ff"
      },
      "colorChartsPurple1100": {
        "light": "#4a238b",
        "dark": "#efe2ff"
      },
      "colorChartsPurple1200": {
        "light": "#431d84",
        "dark": "#f5edff"
      },
      "colorChartsPink300": {
        "light": "#da7596",
        "dark": "#c64a70"
      },
      "colorChartsPink400": {
        "light": "#ce567c",
        "dark": "#d56889"
      },
      "colorChartsPink500": {
        "light": "#c33d69",
        "dark": "#e07f9d"
      },
      "colorChartsPink600": {
        "light": "#b1325c",
        "dark": "#eb92ad"
      },
      "colorChartsPink700": {
        "light": "#a32952",
        "dark": "#f5a2bb"
      },
      "colorChartsPink800": {
        "light": "#962249",
        "dark": "#ffb0c8"
      },
      "colorChartsPink900": {
        "light": "#8b1b42",
        "dark": "#ffc1d4"
      },
      "colorChartsPink1000": {
        "light": "#81143b",
        "dark": "#ffd1de"
      },
      "colorChartsPink1100": {
        "light": "#780d35",
        "dark": "#ffdfe8"
      },
      "colorChartsPink1200": {
        "light": "#6f062f",
        "dark": "#ffecf1"
      },
      "colorChartsStatusCritical": {
        "light": "{colorChartsRed1000}",
        "dark": "{colorChartsRed300}"
      },
      "colorChartsStatusHigh": {
        "light": "{colorChartsRed600}",
        "dark": "{colorChartsRed500}"
      },
      "colorChartsStatusMedium": {
        "light": "{colorChartsOrange400}",
        "dark": "{colorChartsOrange600}"
      },
      "colorChartsStatusLow": {
        "light": "{colorChartsYellow300}",
        "dark": "{colorChartsYellow700}"
      },
      "colorChartsStatusPositive": {
        "light": "{colorChartsGreen300}",
        "dark": "{colorChartsGreen500}"
      },
      "colorChartsStatusInfo": {
        "light": "{colorChartsBlue1400}",
        "dark": "{colorChartsBlue1500}"
      },
      "colorChartsStatusNeutral": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey500}"
      },
      "colorChartsThresholdNegative": {
        "light": "{colorRed600}",
        "dark": "{colorRed500}"
      },
      "colorChartsThresholdPositive": {
        "light": "{colorGreen600}",
        "dark": "{colorGreen500}"
      },
      "colorChartsThresholdInfo": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue400}"
      },
      "colorChartsThresholdNeutral": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorChartsLineGrid": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey600}"
      },
      "colorChartsLineTick": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey600}"
      },
      "colorChartsLineAxis": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey600}"
      },
      "colorChartsPaletteCategorical1": {
        "light": "{colorChartsBlue2300}",
        "dark": "{colorChartsBlue2300}"
      },
      "colorChartsPaletteCategorical2": {
        "light": "{colorChartsPink500}",
        "dark": "{colorChartsPink500}"
      },
      "colorChartsPaletteCategorical3": {
        "light": "{colorChartsTeal300}",
        "dark": "{colorChartsTeal300}"
      },
      "colorChartsPaletteCategorical4": {
        "light": "{colorChartsPurple500}",
        "dark": "{colorChartsPurple500}"
      },
      "colorChartsPaletteCategorical5": {
        "light": "{colorChartsOrange300}",
        "dark": "{colorChartsOrange300}"
      },
      "colorChartsPaletteCategorical6": {
        "light": "{colorChartsBlue2600}",
        "dark": "{colorChartsBlue2600}"
      },
      "colorChartsPaletteCategorical7": {
        "light": "{colorChartsPink800}",
        "dark": "{colorChartsPink800}"
      },
      "colorChartsPaletteCategorical8": {
        "light": "{colorChartsTeal600}",
        "dark": "{colorChartsTeal600}"
      },
      "colorChartsPaletteCategorical9": {
        "light": "{colorChartsPurple800}",
        "dark": "{colorChartsPurple800}"
      },
      "colorChartsPaletteCategorical10": {
        "light": "{colorChartsOrange600}",
        "dark": "{colorChartsOrange600}"
      },
      "colorChartsPaletteCategorical11": {
        "light": "{colorChartsBlue2900}",
        "dark": "{colorChartsBlue2900}"
      },
      "colorChartsPaletteCategorical12": {
        "light": "{colorChartsPink1100}",
        "dark": "{colorChartsPink1100}"
      },
      "colorChartsPaletteCategorical13": {
        "light": "{colorChartsTeal900}",
        "dark": "{colorChartsTeal900}"
      },
      "colorChartsPaletteCategorical14": {
        "light": "{colorChartsPurple1100}",
        "dark": "{colorChartsPurple1100}"
      },
      "colorChartsPaletteCategorical15": {
        "light": "{colorChartsOrange900}",
        "dark": "{colorChartsOrange900}"
      },
      "colorChartsPaletteCategorical16": {
        "light": "{colorChartsBlue21200}",
        "dark": "{colorChartsBlue21200}"
      },
      "colorChartsPaletteCategorical17": {
        "light": "{colorChartsPink400}",
        "dark": "{colorChartsPink400}"
      },
      "colorChartsPaletteCategorical18": {
        "light": "{colorChartsTeal1200}",
        "dark": "{colorChartsTeal1200}"
      },
      "colorChartsPaletteCategorical19": {
        "light": "{colorChartsPurple400}",
        "dark": "{colorChartsPurple400}"
      },
      "colorChartsPaletteCategorical20": {
        "light": "{colorChartsOrange1200}",
        "dark": "{colorChartsOrange1200}"
      },
      "colorChartsPaletteCategorical21": {
        "light": "{colorChartsBlue2500}",
        "dark": "{colorChartsBlue2500}"
      },
      "colorChartsPaletteCategorical22": {
        "light": "{colorChartsPink700}",
        "dark": "{colorChartsPink700}"
      },
      "colorChartsPaletteCategorical23": {
        "light": "{colorChartsTeal500}",
        "dark": "{colorChartsTeal500}"
      },
      "colorChartsPaletteCategorical24": {
        "light": "{colorChartsPurple700}",
        "dark": "{colorChartsPurple700}"
      },
      "colorChartsPaletteCategorical25": {
        "light": "{colorChartsOrange500}",
        "dark": "{colorChartsOrange500}"
      },
      "colorChartsPaletteCategorical26": {
        "light": "{colorChartsBlue2800}",
        "dark": "{colorChartsBlue2800}"
      },
      "colorChartsPaletteCategorical27": {
        "light": "{colorChartsPink1000}",
        "dark": "{colorChartsPink1000}"
      },
      "colorChartsPaletteCategorical28": {
        "light": "{colorChartsTeal800}",
        "dark": "{colorChartsTeal800}"
      },
      "colorChartsPaletteCategorical29": {
        "light": "{colorChartsPurple1000}",
        "dark": "{colorChartsPurple1000}"
      },
      "colorChartsPaletteCategorical30": {
        "light": "{colorChartsOrange800}",
        "dark": "{colorChartsOrange800}"
      },
      "colorChartsPaletteCategorical31": {
        "light": "{colorChartsBlue21100}",
        "dark": "{colorChartsBlue21100}"
      },
      "colorChartsPaletteCategorical32": {
        "light": "{colorChartsPink300}",
        "dark": "{colorChartsPink300}"
      },
      "colorChartsPaletteCategorical33": {
        "light": "{colorChartsTeal1100}",
        "dark": "{colorChartsTeal1100}"
      },
      "colorChartsPaletteCategorical34": {
        "light": "{colorChartsPurple300}",
        "dark": "{colorChartsPurple300}"
      },
      "colorChartsPaletteCategorical35": {
        "light": "{colorChartsOrange1100}",
        "dark": "{colorChartsOrange1100}"
      },
      "colorChartsPaletteCategorical36": {
        "light": "{colorChartsBlue2400}",
        "dark": "{colorChartsBlue2400}"
      },
      "colorChartsPaletteCategorical37": {
        "light": "{colorChartsPink600}",
        "dark": "{colorChartsPink600}"
      },
      "colorChartsPaletteCategorical38": {
        "light": "{colorChartsTeal400}",
        "dark": "{colorChartsTeal400}"
      },
      "colorChartsPaletteCategorical39": {
        "light": "{colorChartsPurple600}",
        "dark": "{colorChartsPurple600}"
      },
      "colorChartsPaletteCategorical40": {
        "light": "{colorChartsOrange400}",
        "dark": "{colorChartsOrange400}"
      },
      "colorChartsPaletteCategorical41": {
        "light": "{colorChartsBlue2700}",
        "dark": "{colorChartsBlue2700}"
      },
      "colorChartsPaletteCategorical42": {
        "light": "{colorChartsPink900}",
        "dark": "{colorChartsPink900}"
      },
      "colorChartsPaletteCategorical43": {
        "light": "{colorChartsTeal700}",
        "dark": "{colorChartsTeal700}"
      },
      "colorChartsPaletteCategorical44": {
        "light": "{colorChartsPurple900}",
        "dark": "{colorChartsPurple900}"
      },
      "colorChartsPaletteCategorical45": {
        "light": "{colorChartsOrange700}",
        "dark": "{colorChartsOrange700}"
      },
      "colorChartsPaletteCategorical46": {
        "light": "{colorChartsBlue21000}",
        "dark": "{colorChartsBlue21000}"
      },
      "colorChartsPaletteCategorical47": {
        "light": "{colorChartsPink1200}",
        "dark": "{colorChartsPink1200}"
      },
      "colorChartsPaletteCategorical48": {
        "light": "{colorChartsTeal1000}",
        "dark": "{colorChartsTeal1000}"
      },
      "colorChartsPaletteCategorical49": {
        "light": "{colorChartsPurple1200}",
        "dark": "{colorChartsPurple1200}"
      },
      "colorChartsPaletteCategorical50": {
        "light": "{colorChartsOrange1000}",
        "dark": "{colorChartsOrange1000}"
      },
      "colorSeverityDarkRed": {
        "light": "#870303",
        "dark": "#d63f38"
      },
      "colorSeverityRed": {
        "light": "#ce3311",
        "dark": "#fe6e73"
      },
      "colorSeverityOrange": {
        "light": "#f89256",
        "dark": "#f89256"
      },
      "colorSeverityYellow": {
        "light": "#f2cd54",
        "dark": "#f2cd54"
      },
      "colorSeverityGrey": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey550}"
      },
      "colorBackgroundNotificationSeverityCritical": {
        "light": "{colorSeverityDarkRed}",
        "dark": "{colorSeverityDarkRed}"
      },
      "colorBackgroundNotificationSeverityHigh": {
        "light": "{colorSeverityRed}",
        "dark": "{colorSeverityRed}"
      },
      "colorBackgroundNotificationSeverityMedium": {
        "light": "{colorSeverityOrange}",
        "dark": "{colorSeverityOrange}"
      },
      "colorBackgroundNotificationSeverityLow": {
        "light": "{colorSeverityYellow}",
        "dark": "{colorSeverityYellow}"
      },
      "colorBackgroundNotificationSeverityNeutral": {
        "light": "{colorSeverityGrey}",
        "dark": "{colorSeverityGrey}"
      },
      "colorTextNotificationSeverityCritical": {
        "light": "{colorGrey100}",
        "dark": "{colorBlack}"
      },
      "colorTextNotificationSeverityHigh": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey900}"
      },
      "colorTextNotificationSeverityMedium": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey900}"
      },
      "colorTextNotificationSeverityLow": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey900}"
      },
      "colorTextNotificationSeverityNeutral": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey100}"
      },
      "colorGreyOpaque10": {
        "light": "rgba(0, 0, 0, 0.1)",
        "dark": "rgba(0, 0, 0, 0.1)"
      },
      "colorGreyOpaque25": {
        "light": "rgba(255, 255, 255, 0.25)",
        "dark": "rgba(255, 255, 255, 0.25)"
      },
      "colorGreyOpaque40": {
        "light": "rgba(0, 0, 0, 0.4)",
        "dark": "rgba(0, 0, 0, 0.4)"
      },
      "colorGreyOpaque50": {
        "light": "rgba(0, 0, 0, 0.5)",
        "dark": "rgba(0, 0, 0, 0.5)"
      },
      "colorGreyOpaque70": {
        "light": "rgba(35, 43, 55, 0.7)",
        "dark": "rgba(15, 20, 26, 0.7)"
      },
      "colorGreyOpaque80": {
        "light": "rgba(22, 25, 31, 0.8)",
        "dark": "rgba(22, 25, 31, 0.8)"
      },
      "colorGreyOpaque90": {
        "light": "rgba(242, 243, 243, 0.9)",
        "dark": "rgba(242, 243, 243, 0.9)"
      },
      "colorGreyTransparent": {
        "light": "rgba(15, 20, 26, 0.12)",
        "dark": "rgba(15, 20, 26, 1)"
      },
      "colorGreyTransparentHeavy": {
        "light": "rgba(15, 20, 26, 0.12)",
        "dark": "rgba(15, 20, 26, 1)"
      },
      "colorGreyTransparentLight": {
        "light": "rgba(15, 20, 26, 0.12)",
        "dark": "rgba(15, 20, 26, 1)"
      },
      "colorBackgroundBadgeIcon": {
        "light": "{colorRed600}",
        "dark": "{colorRed500}"
      },
      "colorBackgroundButtonLinkActive": {
        "light": "{colorBlue200}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundButtonLinkHover": {
        "light": "{colorBlue100}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundButtonNormalActive": {
        "light": "{colorBlue200}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundButtonNormalDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundButtonNormalDisabled": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundButtonNormalHover": {
        "light": "{colorBlue100}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundToggleButtonNormalPressed": {
        "light": "{colorBlue200}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundButtonPrimaryActive": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundButtonPrimaryDefault": {
        "light": "#006499",
        "dark": "#D73A45"
      },
      "colorBackgroundButtonPrimaryDisabled": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey700}"
      },
      "colorBackgroundButtonPrimaryHover": {
        "light": "{colorBorderButtonNormalHover}",
        "dark": "{colorBorderButtonNormalHover}"
      },
      "colorBackgroundCalendarCurrentDate": {
        "light": "{colorGrey150}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundCellShaded": {
        "light": "{colorGrey125}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundCodeEditorGutterActiveLineDefault": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey500}"
      },
      "colorBackgroundCodeEditorGutterActiveLineError": {
        "light": "{colorTextStatusError}",
        "dark": "{colorTextStatusError}"
      },
      "colorBackgroundCodeEditorGutterDefault": {
        "light": "{colorGrey150}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundCodeEditorLoading": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundCodeEditorPaneItemHover": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundCodeEditorStatusBar": {
        "light": "{colorGrey150}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundContainerContent": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundContainerHeader": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundControlChecked": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundControlDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundControlDisabled": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundDropdownItemDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundDropdownItemDimmed": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorBackgroundDropdownItemFilterMatch": {
        "light": "{colorBlue100}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundDropdownItemHover": {
        "light": "{colorGrey150}",
        "dark": "{colorGrey850}"
      },
      "colorBackgroundDropdownItemSelected": {
        "light": "{colorBackgroundItemSelected}",
        "dark": "{colorBackgroundItemSelected}"
      },
      "colorBackgroundHomeHeader": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey900}"
      },
      "colorBackgroundInputDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundInputDisabled": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundItemSelected": {
        "light": "{colorBlue100}",
        "dark": "{colorBlue900}"
      },
      "colorBackgroundLayoutMain": {
        "light": "#00FF00",
        "dark": "#0A0A0A"
      },
      "colorBackgroundLayoutMobilePanel": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey900}"
      },
      "colorBackgroundLayoutPanelContent": {
        "light": "{colorBackgroundContainerContent}",
        "dark": "{colorBackgroundContainerContent}"
      },
      "colorBackgroundLayoutPanelHover": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundLayoutToggleActive": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey600}"
      },
      "colorBackgroundLayoutToggleDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey600}"
      },
      "colorBackgroundLayoutToggleHover": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey550}"
      },
      "colorBackgroundLayoutToggleSelectedActive": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundLayoutToggleSelectedDefault": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundLayoutToggleSelectedHover": {
        "light": "{colorBlue700}",
        "dark": "{colorBlue400}"
      },
      "colorBackgroundModalOverlay": {
        "light": "{colorGreyOpaque70}",
        "dark": "{colorGreyOpaque70}"
      },
      "colorBackgroundNotificationBlue": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue600}"
      },
      "colorBackgroundNotificationGreen": {
        "light": "{colorGreen600}",
        "dark": "{colorGreen600}"
      },
      "colorBackgroundNotificationGrey": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey550}"
      },
      "colorBackgroundNotificationRed": {
        "light": "{colorRed600}",
        "dark": "{colorRed600}"
      },
      "colorBackgroundNotificationYellow": {
        "light": "{colorYellow600}",
        "dark": "{colorYellow600}"
      },
      "colorBackgroundNotificationStackBar": {
        "light": "{colorGrey700}",
        "dark": "{colorGrey700}"
      },
      "colorBackgroundNotificationStackBarActive": {
        "light": "{colorGrey700}",
        "dark": "{colorGrey700}"
      },
      "colorBackgroundNotificationStackBarHover": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey600}"
      },
      "colorBackgroundPopover": {
        "light": "{colorWhite}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundProgressBarContentDefault": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundProgressBarContentInFlash": {
        "light": "{colorWhite}",
        "dark": "{colorWhite}"
      },
      "colorBackgroundProgressBarLayoutDefault": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey650}"
      },
      "colorBackgroundProgressBarLayoutInFlash": {
        "light": "{colorGreyOpaque25}",
        "dark": "{colorGreyOpaque25}"
      },
      "colorBackgroundSegmentActive": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundSegmentDefault": {
        "light": "{colorBackgroundButtonNormalDefault}",
        "dark": "{colorBackgroundButtonNormalDefault}"
      },
      "colorBackgroundSegmentDisabled": {
        "light": "{colorBackgroundButtonNormalDisabled}",
        "dark": "{colorBackgroundButtonNormalDisabled}"
      },
      "colorBackgroundSegmentHover": {
        "light": "{colorBackgroundSegmentDefault}",
        "dark": "{colorBackgroundSegmentDefault}"
      },
      "colorBackgroundSliderHandleDefault": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBackgroundSliderHandleActive": {
        "light": "{colorBlue700}",
        "dark": "{colorBlue400}"
      },
      "colorBackgroundSliderTrack": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey550}"
      },
      "colorBackgroundSliderHandleRing": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorBackgroundSliderErrorPressed": {
        "light": "{colorRed700}",
        "dark": "{colorRed500}"
      },
      "colorBackgroundSliderWarningPressed": {
        "light": "{colorYellow800}",
        "dark": "{colorYellow700}"
      },
      "colorBackgroundStatusError": {
        "light": "{colorRed100}",
        "dark": "{colorRed900}"
      },
      "colorBackgroundStatusInfo": {
        "light": "{colorBlue100}",
        "dark": "{colorBlue900}"
      },
      "colorBackgroundStatusSuccess": {
        "light": "{colorGreen100}",
        "dark": "{colorGreen900}"
      },
      "colorBackgroundStatusWarning": {
        "light": "{colorYellow100}",
        "dark": "{colorYellow900}"
      },
      "colorBackgroundTableHeader": {
        "light": "{colorBackgroundContainerHeader}",
        "dark": "{colorBackgroundContainerHeader}"
      },
      "colorBackgroundTilesDisabled": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey750}"
      },
      "colorBackgroundToggleCheckedDisabled": {
        "light": "{colorBlue300}",
        "dark": "{colorBlue800}"
      },
      "colorBackgroundToggleDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey500}"
      },
      "colorBackgroundAvatarGenAi": {
        "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
        "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
      },
      "colorBackgroundAvatarDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey600}"
      },
      "colorTextAvatar": {
        "light": "{colorWhite}",
        "dark": "{colorWhite}"
      },
      "colorBackgroundLoadingBarGenAi": {
        "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
        "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
      },
      "colorBackgroundChatBubbleOutgoing": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorBackgroundChatBubbleIncoming": {
        "light": "{colorGrey125}",
        "dark": "{colorGrey900}"
      },
      "colorTextChatBubbleOutgoing": {
        "light": "{colorTextBodyDefault}",
        "dark": "{colorTextBodyDefault}"
      },
      "colorTextChatBubbleIncoming": {
        "light": "{colorTextBodyDefault}",
        "dark": "{colorTextBodyDefault}"
      },
      "colorBorderButtonNormalActive": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "colorBorderButtonNormalDefault": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBorderToggleButtonNormalPressed": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBorderButtonNormalDisabled": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey550}"
      },
      "colorTextButtonNormalDisabled": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey500}"
      },
      "colorBorderButtonNormalHover": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "colorBorderButtonPrimaryDisabled": {
        "light": "{colorBackgroundButtonPrimaryDisabled}",
        "dark": "{colorBackgroundButtonPrimaryDisabled}"
      },
      "colorTextButtonPrimaryDisabled": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey500}"
      },
      "colorBorderCalendarGrid": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorBorderCalendarGridSelectedFocusRing": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey800}"
      },
      "colorBorderCodeEditorAceActiveLineLightTheme": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey300}"
      },
      "colorBorderCodeEditorAceActiveLineDarkTheme": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey550}"
      },
      "colorBorderCodeEditorDefault": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey550}"
      },
      "colorBorderCodeEditorPaneItemHover": {
        "light": "{colorBorderDropdownItemHover}",
        "dark": "{colorBorderDropdownItemHover}"
      },
      "colorBorderContainerDivider": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorBorderContainerTop": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorBorderControlChecked": {
        "light": "{colorBackgroundControlChecked}",
        "dark": "{colorBackgroundControlChecked}"
      },
      "colorBorderControlDefault": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey500}"
      },
      "colorBorderControlDisabled": {
        "light": "{colorBackgroundControlDisabled}",
        "dark": "{colorBackgroundControlDisabled}"
      },
      "colorBorderDividerActive": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey100}"
      },
      "colorBorderDividerDefault": {
        "light": "{colorGrey350}",
        "dark": "{colorGrey600}"
      },
      "colorBorderDividerPanelBottom": {
        "light": "{colorBorderDividerDefault}",
        "dark": "{colorBorderDividerDefault}"
      },
      "colorBorderDividerPanelSide": {
        "light": "{colorBorderDividerDefault}",
        "dark": "{colorBorderDividerDefault}"
      },
      "colorBorderDividerSecondary": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey700}"
      },
      "colorBorderDropdownContainer": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey550}"
      },
      "colorBorderDropdownGroup": {
        "light": "{colorBorderDropdownItemDefault}",
        "dark": "{colorBorderDropdownItemDefault}"
      },
      "colorBorderDropdownItemDefault": {
        "light": "{colorBorderDividerDefault}",
        "dark": "{colorBorderDividerDefault}"
      },
      "colorBorderDropdownItemHover": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey550}"
      },
      "colorBorderDropdownItemDimmedHover": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey500}"
      },
      "colorBorderDropdownItemSelected": {
        "light": "{colorBorderItemSelected}",
        "dark": "{colorBorderItemSelected}"
      },
      "colorBorderDropdownItemTop": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorBorderEditableCellHover": {
        "light": "{colorBorderDropdownItemHover}",
        "dark": "{colorBorderDropdownItemHover}"
      },
      "colorBorderInputDefault": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey550}"
      },
      "colorBorderInputDisabled": {
        "light": "{colorBackgroundInputDisabled}",
        "dark": "{colorBackgroundInputDisabled}"
      },
      "colorBorderInputFocused": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue300}"
      },
      "colorBorderItemFocused": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBorderDropdownItemFocused": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey300}"
      },
      "colorBorderItemPlaceholder": {
        "light": "{colorBorderItemSelected}",
        "dark": "{colorBorderItemSelected}"
      },
      "colorBorderItemSelected": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBorderLayout": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey600}"
      },
      "colorBorderNotificationStackBar": {
        "light": "{colorGrey700}",
        "dark": "{colorGrey700}"
      },
      "colorBorderPanelHeader": {
        "light": "{colorBorderDividerDefault}",
        "dark": "{colorBorderDividerDefault}"
      },
      "colorBorderPopover": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey550}"
      },
      "colorBorderSegmentActive": {
        "light": "{colorBorderSegmentDefault}",
        "dark": "{colorBorderSegmentDefault}"
      },
      "colorBorderSegmentDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey300}"
      },
      "colorBorderSegmentDisabled": {
        "light": "{colorBorderSegmentDefault}",
        "dark": "{colorBorderSegmentDefault}"
      },
      "colorBorderSegmentHover": {
        "light": "{colorBorderSegmentDefault}",
        "dark": "{colorBorderSegmentDefault}"
      },
      "colorBorderStatusError": {
        "light": "{colorRed600}",
        "dark": "{colorRed500}"
      },
      "colorBorderStatusInfo": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorBorderStatusSuccess": {
        "light": "{colorGreen600}",
        "dark": "{colorGreen500}"
      },
      "colorBorderStatusWarning": {
        "light": "{colorYellow800}",
        "dark": "{colorYellow700}"
      },
      "colorBorderDividerInteractiveDefault": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey300}"
      },
      "colorBorderTabsDivider": {
        "light": "{colorGrey350}",
        "dark": "{colorGrey600}"
      },
      "colorBorderTabsShadow": {
        "light": "{colorGreyTransparent}",
        "dark": "{colorGreyTransparent}"
      },
      "colorBorderTabsUnderline": {
        "light": "{colorTextAccent}",
        "dark": "{colorTextAccent}"
      },
      "colorBorderTilesDisabled": {
        "light": "{colorBackgroundTilesDisabled}",
        "dark": "{colorBackgroundTilesDisabled}"
      },
      "colorBorderTutorial": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey600}"
      },
      "colorForegroundControlDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorForegroundControlDisabled": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorForegroundControlReadOnly": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorShadowDefault": {
        "light": "{colorGreyTransparentHeavy}",
        "dark": "{colorGreyTransparentHeavy}"
      },
      "colorShadowMedium": {
        "light": "{colorGreyTransparent}",
        "dark": "{colorGreyTransparent}"
      },
      "colorShadowSide": {
        "light": "{colorGreyTransparentLight}",
        "dark": "{colorGreyTransparentLight}"
      },
      "colorStrokeChartLine": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey500}"
      },
      "colorStrokeCodeEditorResizeHandler": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey300}"
      },
      "colorStrokeCodeEditorGutterActiveLineDefault": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey750}"
      },
      "colorStrokeCodeEditorGutterActiveLineHover": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey900}"
      },
      "colorTextAccent": {
        "light": "#006499",
        "dark": "#D73A45"
      },
      "colorTextBodyDefault": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey350}"
      },
      "colorTextBodySecondary": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey350}"
      },
      "colorTextBreadcrumbCurrent": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey500}"
      },
      "colorTextBreadcrumbIcon": {
        "light": "{colorGrey500}",
        "dark": "{colorTextInteractiveDisabled}"
      },
      "colorTextButtonInlineIconDefault": {
        "light": "{colorTextLinkDefault}",
        "dark": "{colorTextLinkDefault}"
      },
      "colorTextButtonInlineIconDisabled": {
        "light": "{colorTextInteractiveDisabled}",
        "dark": "{colorTextInteractiveDisabled}"
      },
      "colorTextButtonInlineIconHover": {
        "light": "{colorTextLinkHover}",
        "dark": "{colorTextLinkHover}"
      },
      "colorTextButtonNormalActive": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "colorTextToggleButtonNormalPressed": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "colorTextButtonNormalDefault": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorTextButtonNormalHover": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "colorTextLinkButtonNormalDefault": {
        "light": "{colorTextButtonNormalDefault}",
        "dark": "{colorTextButtonNormalDefault}"
      },
      "colorTextLinkButtonNormalHover": {
        "light": "{colorTextButtonNormalHover}",
        "dark": "{colorTextButtonNormalHover}"
      },
      "colorTextLinkButtonNormalActive": {
        "light": "{colorTextButtonNormalActive}",
        "dark": "{colorTextButtonNormalActive}"
      },
      "colorTextButtonPrimaryActive": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextButtonPrimaryDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextButtonPrimaryHover": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextCalendarDateHover": {
        "light": "{colorTextDropdownItemDefault}",
        "dark": "{colorTextDropdownItemDefault}"
      },
      "colorTextCalendarDateSelected": {
        "light": "{colorTextAccent}",
        "dark": "{colorTextAccent}"
      },
      "colorTextCalendarMonth": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorTextCodeEditorGutterActiveLine": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextCodeEditorGutterDefault": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey300}"
      },
      "colorTextCodeEditorStatusBarDisabled": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey550}"
      },
      "colorTextCodeEditorTabButtonError": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextColumnHeader": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey400}"
      },
      "colorTextColumnSortingIcon": {
        "light": "{colorTextColumnHeader}",
        "dark": "{colorTextColumnHeader}"
      },
      "colorTextControlDisabled": {
        "light": "{colorTextInteractiveDisabled}",
        "dark": "{colorTextInteractiveDisabled}"
      },
      "colorTextCounter": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorTextDisabled": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey550}"
      },
      "colorTextDisabledInlineEdit": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey400}"
      },
      "colorTextDropdownFooter": {
        "light": "{colorTextFormSecondary}",
        "dark": "{colorTextFormSecondary}"
      },
      "colorTextDropdownGroupLabel": {
        "light": "{colorTextGroupLabel}",
        "dark": "{colorTextGroupLabel}"
      },
      "colorTextDropdownItemDefault": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey300}"
      },
      "colorTextDropdownItemDimmed": {
        "light": "{colorTextInteractiveDisabled}",
        "dark": "{colorTextInteractiveDisabled}"
      },
      "colorTextDropdownItemDisabled": {
        "light": "{colorTextInteractiveDisabled}",
        "dark": "{colorTextInteractiveDisabled}"
      },
      "colorTextDropdownItemFilterMatch": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue400}"
      },
      "colorTextDropdownItemHighlighted": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey200}"
      },
      "colorTextDropdownItemSecondary": {
        "light": "{colorTextFormSecondary}",
        "dark": "{colorTextFormSecondary}"
      },
      "colorTextDropdownItemSecondaryHover": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey300}"
      },
      "colorTextEmpty": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey300}"
      },
      "colorTextExpandableSectionDefault": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey300}"
      },
      "colorTextExpandableSectionHover": {
        "light": "{colorTextAccent}",
        "dark": "{colorTextAccent}"
      },
      "colorTextExpandableSectionNavigationIconDefault": {
        "light": "{colorTextInteractiveDefault}",
        "dark": "{colorTextInteractiveDefault}"
      },
      "colorTextFormDefault": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey300}"
      },
      "colorTextFormLabel": {
        "light": "{colorTextFormDefault}",
        "dark": "{colorTextFormDefault}"
      },
      "colorTextFormSecondary": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorTextGroupLabel": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey350}"
      },
      "colorTextLabelGenAi": {
        "light": "{colorPurple600}",
        "dark": "{colorPurple400}"
      },
      "colorTextHeadingDefault": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey200}"
      },
      "colorTextHeadingSecondary": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey450}"
      },
      "colorTextHomeHeaderDefault": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey200}"
      },
      "colorTextHomeHeaderSecondary": {
        "light": "{colorGrey350}",
        "dark": "{colorGrey350}"
      },
      "colorTextIconCaret": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey450}"
      },
      "colorTextIconSubtle": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey400}"
      },
      "colorTextInputDisabled": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey550}"
      },
      "colorTextInputPlaceholder": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorTextInputPlaceholderDisabled": {
        "light": "{colorTextInputDisabled}",
        "dark": "{colorTextInputDisabled}"
      },
      "colorTextInteractiveActive": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey100}"
      },
      "colorTextInteractiveDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey300}"
      },
      "colorTextInteractiveDisabled": {
        "light": "{colorGrey400}",
        "dark": "{colorGrey550}"
      },
      "colorTextInteractiveHover": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey100}"
      },
      "colorTextToggleButtonIconPressed": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey100}"
      },
      "colorTextInteractiveInvertedDefault": {
        "light": "{colorGrey300}",
        "dark": "{colorGrey300}"
      },
      "colorTextInteractiveInvertedHover": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey100}"
      },
      "colorTextInverted": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextLabel": {
        "light": "{colorTextFormLabel}",
        "dark": "{colorTextFormLabel}"
      },
      "colorTextLayoutToggle": {
        "light": "{colorWhite}",
        "dark": "{colorWhite}"
      },
      "colorTextLayoutToggleActive": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorTextLayoutToggleHover": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorTextLayoutToggleSelected": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextLinkDefault": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorTextLinkHover": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "colorTextLinkInvertedHover": {
        "light": "{colorWhite}",
        "dark": "{colorWhite}"
      },
      "colorTextLinkButtonUnderline": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorTextLinkButtonUnderlineHover": {
        "light": "transparent",
        "dark": "transparent"
      },
      "colorTextNotificationDefault": {
        "light": "{colorGrey100}",
        "dark": "{colorGrey100}"
      },
      "colorTextNotificationStackBar": {
        "light": "{colorWhite}",
        "dark": "{colorWhite}"
      },
      "colorTextNotificationYellow": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey900}"
      },
      "colorTextPaginationPageNumberActiveDisabled": {
        "light": "{colorTextInteractiveDisabled}",
        "dark": "{colorTextInteractiveDisabled}"
      },
      "colorTextPaginationPageNumberDefault": {
        "light": "{colorTextInteractiveDefault}",
        "dark": "{colorGrey400}"
      },
      "colorTextSegmentActive": {
        "light": "{colorWhite}",
        "dark": "{colorGrey900}"
      },
      "colorTextSegmentDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey300}"
      },
      "colorTextSegmentHover": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorTextSmall": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorTextStatusError": {
        "light": "{colorRed600}",
        "dark": "{colorRed500}"
      },
      "colorTextStatusInactive": {
        "light": "{colorGrey550}",
        "dark": "{colorGrey450}"
      },
      "colorTextStatusInfo": {
        "light": "{colorBlue600}",
        "dark": "{colorBlue500}"
      },
      "colorTextStatusSuccess": {
        "light": "{colorGreen600}",
        "dark": "{colorGreen500}"
      },
      "colorTextStatusWarning": {
        "light": "{colorYellow800}",
        "dark": "{colorYellow700}"
      },
      "colorTextTopNavigationTitle": {
        "light": "{colorGrey900}",
        "dark": "{colorGrey100}"
      },
      "colorBoardPlaceholderActive": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey550}"
      },
      "colorBoardPlaceholderHover": {
        "light": "{colorBlue200}",
        "dark": "{colorBlue600}"
      },
      "colorDragPlaceholderActive": {
        "light": "{colorGrey200}",
        "dark": "{colorGrey550}"
      },
      "colorDragPlaceholderHover": {
        "light": "{colorBlue200}",
        "dark": "{colorBlue600}"
      },
      "colorDropzoneBackgroundDefault": {
        "light": "{colorWhite}",
        "dark": "{colorGrey800}"
      },
      "colorDropzoneBackgroundHover": {
        "light": "{colorBlue100}",
        "dark": "{colorBlue900}"
      },
      "colorDropzoneTextDefault": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey350}"
      },
      "colorDropzoneTextHover": {
        "light": "{colorGrey600}",
        "dark": "{colorGrey350}"
      },
      "colorDropzoneBorderDefault": {
        "light": "{colorGrey500}",
        "dark": "{colorGrey550}"
      },
      "colorDropzoneBorderHover": {
        "light": "{colorBlue800}",
        "dark": "{colorBlue400}"
      },
      "fontBoxValueLargeWeight": "700",
      "fontButtonLetterSpacing": "0.005em",
      "fontChartDetailSize": "{fontSizeBodyS}",
      "fontDisplayLabelWeight": "700",
      "fontExpandableHeadingSize": "{fontSizeHeadingS}",
      "fontFamilyBase": "Open Sans",
      "fontFamilyMonospace": "Monaco, Menlo, Consolas, 'Courier Prime', Courier, 'Courier New', monospace",
      "fontHeaderH2DescriptionLineHeight": "{lineHeightBodyM}",
      "fontHeaderH2DescriptionSize": "{fontSizeBodyM}",
      "fontLinkButtonLetterSpacing": "{fontButtonLetterSpacing}",
      "fontLinkButtonWeight": "{fontWeightButton}",
      "fontPanelHeaderLineHeight": "{lineHeightHeadingM}",
      "fontPanelHeaderSize": "{fontSizeHeadingM}",
      "fontSizeBodyM": "14px",
      "fontSizeBodyS": "14px",
      "fontSizeDisplayL": "42px",
      "fontSizeHeadingXl": "24px",
      "fontSizeHeadingL": "20px",
      "fontSizeHeadingM": "18px",
      "fontSizeHeadingS": "16px",
      "fontSizeHeadingXs": "14px",
      "fontSmoothingMozOsx": "grayscale",
      "fontSmoothingWebkit": "antialiased",
      "fontTabsDisabledWeight": "{fontWayfindingLinkActiveWeight}",
      "fontTabsLineHeight": "{lineHeightHeadingS}",
      "fontTabsSize": "{fontSizeHeadingS}",
      "fontWayfindingLinkActiveWeight": "700",
      "fontWeightButton": "700",
      "fontWeightHeadingXl": "700",
      "fontWeightHeadingL": "700",
      "fontWeightHeadingM": "700",
      "fontWeightHeadingS": "700",
      "fontWeightHeadingXs": "700",
      "fontWeightHeavy": "700",
      "letterSpacingBodyS": "0.005em",
      "letterSpacingDisplayL": "-0.03em",
      "letterSpacingHeadingXl": "-0.02em",
      "letterSpacingHeadingL": "-0.015em",
      "letterSpacingHeadingM": "-0.010em",
      "letterSpacingHeadingS": "-0.005em",
      "lineHeightBodyM": "20px",
      "lineHeightBodyS": "16px",
      "lineHeightDisplayL": "48px",
      "lineHeightHeadingXl": "30px",
      "lineHeightHeadingL": "24px",
      "lineHeightHeadingM": "22px",
      "lineHeightHeadingS": "20px",
      "lineHeightHeadingXs": "18px",
      "borderActiveWidth": "4px",
      "borderCodeEditorStatusDividerWidth": "{borderDividerSectionWidth}",
      "borderContainerStickyWidth": "0px",
      "borderContainerTopWidth": "0px",
      "borderControlFocusRingShadowSpread": "0px",
      "borderControlInvalidFocusRingShadowSpread": "2px",
      "borderDividerListWidth": "1px",
      "borderDividerSectionWidth": "1px",
      "borderDropdownVirtualOffsetWidth": "2px",
      "borderInvalidWidth": "8px",
      "borderItemWidth": "2px",
      "borderLineChartDashArray": "3 5",
      "borderLineChartLineJoin": "round",
      "borderLineChartWidth": "2px",
      "borderPanelHeaderWidth": "1px",
      "borderPanelTopWidth": "1px",
      "borderRadiusAlert": "{borderRadiusFlashbar}",
      "borderRadiusBadge": "4px",
      "borderRadiusButton": "8px",
      "borderRadiusCalendarDayFocusRing": "3px",
      "borderRadiusCodeEditor": "{borderRadiusInput}",
      "borderRadiusContainer": "16px",
      "borderRadiusControlCircularFocusRing": "4px",
      "borderRadiusControlDefaultFocusRing": "4px",
      "borderRadiusDropdown": "{borderRadiusItem}",
      "borderRadiusDropzone": "12px",
      "borderRadiusFlashbar": "12px",
      "borderRadiusItem": "8px",
      "borderRadiusInput": "8px",
      "borderRadiusPopover": "{borderRadiusInput}",
      "borderRadiusTabsFocusRing": "20px",
      "borderRadiusTiles": "{borderRadiusInput}",
      "borderRadiusToken": "{borderRadiusInput}",
      "borderRadiusChatBubble": "8px",
      "borderRadiusTutorialPanelItem": "{borderRadiusInput}",
      "borderTableStickyWidth": "1px",
      "borderLinkFocusRingOutline": "0",
      "borderLinkFocusRingShadowSpread": "2px",
      "borderWidthAlert": "2px",
      "borderWidthField": "2px",
      "borderWidthPopover": "2px",
      "motionDurationExtraFast": {
        "default": "45ms",
        "disabled": "0ms"
      },
      "motionDurationExtraSlow": {
        "default": "270ms",
        "disabled": "0ms"
      },
      "motionDurationFast": {
        "default": "90ms",
        "disabled": "0ms"
      },
      "motionDurationModerate": {
        "default": "135ms",
        "disabled": "0ms"
      },
      "motionDurationRefreshOnlyAmbient": {
        "default": "2000ms",
        "disabled": "0ms"
      },
      "motionDurationRefreshOnlyFast": {
        "default": "115ms",
        "disabled": "0ms"
      },
      "motionDurationRefreshOnlyMedium": {
        "default": "165ms",
        "disabled": "0ms"
      },
      "motionDurationRefreshOnlySlow": {
        "default": "250ms",
        "disabled": "0ms"
      },
      "motionDurationAvatarGenAiGradient": {
        "default": "3600ms",
        "disabled": "0ms"
      },
      "motionDurationAvatarLoadingDots": {
        "default": "1200ms",
        "disabled": "0ms"
      },
      "motionDurationRotate180": {
        "default": "{motionDurationModerate}",
        "disabled": "{motionDurationModerate}"
      },
      "motionDurationRotate90": {
        "default": "{motionDurationModerate}",
        "disabled": "{motionDurationModerate}"
      },
      "motionDurationShowPaced": {
        "default": "{motionDurationSlow}",
        "disabled": "{motionDurationSlow}"
      },
      "motionDurationShowQuick": {
        "default": "{motionDurationModerate}",
        "disabled": "{motionDurationModerate}"
      },
      "motionDurationSlow": {
        "default": "180ms",
        "disabled": "0ms"
      },
      "motionDurationTransitionQuick": {
        "default": "{motionDurationFast}",
        "disabled": "{motionDurationFast}"
      },
      "motionDurationTransitionShowPaced": {
        "default": "{motionDurationSlow}",
        "disabled": "{motionDurationSlow}"
      },
      "motionDurationTransitionShowQuick": {
        "default": "{motionDurationFast}",
        "disabled": "{motionDurationFast}"
      },
      "motionEasingEaseOutQuart": {
        "default": "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "disabled": "cubic-bezier(0.165, 0.84, 0.44, 1)"
      },
      "motionEasingRefreshOnlyA": {
        "default": "cubic-bezier(0, 0, 0, 1)",
        "disabled": "cubic-bezier(0, 0, 0, 1)"
      },
      "motionEasingRefreshOnlyB": {
        "default": "cubic-bezier(1, 0, 0.83, 1)",
        "disabled": "cubic-bezier(1, 0, 0.83, 1)"
      },
      "motionEasingRefreshOnlyC": {
        "default": "cubic-bezier(0.84, 0, 0.16, 1)",
        "disabled": "cubic-bezier(0.84, 0, 0.16, 1)"
      },
      "motionEasingRefreshOnlyD": {
        "default": "cubic-bezier(0.33, 0, 0.67, 1)",
        "disabled": "cubic-bezier(0.33, 0, 0.67, 1)"
      },
      "motionEasingAvatarGenAiGradient": {
        "default": "cubic-bezier(0.7, 0, 0.3, 1)",
        "disabled": "cubic-bezier(0.7, 0, 0.3, 1)"
      },
      "motionEasingRotate180": {
        "default": "{motionEasingEaseOutQuart}",
        "disabled": "{motionEasingEaseOutQuart}"
      },
      "motionEasingRotate90": {
        "default": "{motionEasingEaseOutQuart}",
        "disabled": "{motionEasingEaseOutQuart}"
      },
      "motionEasingShowPaced": {
        "default": "ease-out",
        "disabled": "ease-out"
      },
      "motionEasingShowQuick": {
        "default": "ease-out",
        "disabled": "ease-out"
      },
      "motionEasingTransitionQuick": {
        "default": "linear",
        "disabled": "linear"
      },
      "motionEasingTransitionShowPaced": {
        "default": "ease-out",
        "disabled": "ease-out"
      },
      "motionEasingTransitionShowQuick": {
        "default": "linear",
        "disabled": "linear"
      },
      "motionEasingResponsive": {
        "default": "{motionEasingRefreshOnlyA}",
        "disabled": "{motionEasingRefreshOnlyA}"
      },
      "motionEasingSticky": {
        "default": "{motionEasingRefreshOnlyB}",
        "disabled": "{motionEasingRefreshOnlyB}"
      },
      "motionEasingExpressive": {
        "default": "{motionEasingRefreshOnlyC}",
        "disabled": "{motionEasingRefreshOnlyC}"
      },
      "motionDurationResponsive": {
        "default": "{motionDurationRefreshOnlyFast}",
        "disabled": "{motionDurationRefreshOnlyFast}"
      },
      "motionDurationExpressive": {
        "default": "{motionDurationRefreshOnlyMedium}",
        "disabled": "{motionDurationRefreshOnlyMedium}"
      },
      "motionDurationComplex": {
        "default": "{motionDurationRefreshOnlySlow}",
        "disabled": "{motionDurationRefreshOnlySlow}"
      },
      "motionKeyframesFadeIn": {
        "default": "awsui-fade-in-35003c",
        "disabled": "awsui-fade-in-35003c"
      },
      "motionKeyframesFadeOut": {
        "default": "awsui-fade-out-35003c",
        "disabled": "awsui-fade-out-35003c"
      },
      "motionKeyframesStatusIconError": {
        "default": "awsui-status-icon-error-35003c",
        "disabled": "awsui-status-icon-error-35003c"
      },
      "motionKeyframesScalePopup": {
        "default": "awsui-scale-popup-35003c",
        "disabled": "awsui-scale-popup-35003c"
      },
      "sizeCalendarGridWidth": {
        "comfortable": "238px",
        "compact": "238px"
      },
      "sizeControl": {
        "comfortable": "16px",
        "compact": "16px"
      },
      "sizeIconBig": {
        "comfortable": "32px",
        "compact": "32px"
      },
      "sizeIconLarge": {
        "comfortable": "48px",
        "compact": "48px"
      },
      "sizeIconMedium": {
        "comfortable": "20px",
        "compact": "20px"
      },
      "sizeIconNormal": {
        "comfortable": "16px",
        "compact": "16px"
      },
      "sizeTableSelectionHorizontal": {
        "comfortable": "40px",
        "compact": "40px"
      },
      "sizeVerticalInput": {
        "comfortable": "32px",
        "compact": "28px"
      },
      "sizeVerticalPanelIconOffset": {
        "comfortable": "15px",
        "compact": "13px"
      },
      "spaceAlertActionLeft": {
        "comfortable": "{spaceS}",
        "compact": "{spaceS}"
      },
      "spaceAlertHorizontal": {
        "comfortable": "{spaceFlashbarHorizontal}",
        "compact": "{spaceFlashbarHorizontal}"
      },
      "spaceAlertMessageRight": {
        "comfortable": "{spaceXxs}",
        "compact": "{spaceXxs}"
      },
      "spaceAlertVertical": {
        "comfortable": "{spaceScaledXs}",
        "compact": "{spaceScaledXs}"
      },
      "spaceButtonFocusOutlineGutter": {
        "comfortable": "4px",
        "compact": "4px"
      },
      "spaceButtonHorizontal": {
        "comfortable": "{spaceScaledL}",
        "compact": "{spaceScaledL}"
      },
      "spaceButtonIconFocusOutlineGutterVertical": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceButtonIconOnlyHorizontal": {
        "comfortable": "6px",
        "compact": "{spaceXxs}"
      },
      "spaceButtonInlineIconFocusOutlineGutter": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceButtonModalDismissVertical": {
        "comfortable": "{spaceScaledXxxs}",
        "compact": "{spaceScaledXxxs}"
      },
      "spaceCalendarGridFocusOutlineGutter": {
        "comfortable": "-5px",
        "compact": "-5px"
      },
      "spaceCalendarGridSelectedFocusOutlineGutter": {
        "comfortable": "{spaceCalendarGridFocusOutlineGutter}",
        "compact": "{spaceCalendarGridFocusOutlineGutter}"
      },
      "spaceCalendarGridGutter": {
        "comfortable": "6px",
        "compact": "6px"
      },
      "spaceCardHorizontal": {
        "comfortable": "{spaceContainerHorizontal}",
        "compact": "{spaceContainerHorizontal}"
      },
      "spaceCardVertical": {
        "comfortable": "{spaceScaledM}",
        "compact": "{spaceScaledM}"
      },
      "spaceCodeEditorStatusFocusOutlineGutter": {
        "comfortable": "-7px",
        "compact": "-7px"
      },
      "spaceContainerContentTop": {
        "comfortable": "{spaceXxs}",
        "compact": "{spaceXxs}"
      },
      "spaceContainerHeaderTop": {
        "comfortable": "{spaceS}",
        "compact": "{spaceS}"
      },
      "spaceContainerHeaderBottom": {
        "comfortable": "{spaceScaledXs}",
        "compact": "{spaceScaledXs}"
      },
      "spaceContainerHorizontal": {
        "comfortable": "{spaceL}",
        "compact": "{spaceL}"
      },
      "spaceContentHeaderPaddingBottom": {
        "comfortable": "{spaceScaledM}",
        "compact": "{spaceScaledM}"
      },
      "spaceDarkHeaderOverlapDistance": {
        "comfortable": "36px",
        "compact": "32px"
      },
      "spaceExpandableSectionIconOffsetTop": {
        "comfortable": "{spaceScaled2xXxs}",
        "compact": "{spaceScaled2xXxs}"
      },
      "spaceFieldHorizontal": {
        "comfortable": "{spaceS}",
        "compact": "{spaceS}"
      },
      "spaceFieldIconOffset": {
        "comfortable": "36px",
        "compact": "36px"
      },
      "spaceFilteringTokenDismissButtonFocusOutlineGutter": {
        "comfortable": "-5px",
        "compact": "-5px"
      },
      "spaceFilteringTokenOperationSelectFocusOutlineGutter": {
        "comfortable": "-5px",
        "compact": "-5px"
      },
      "spaceFlashbarActionLeft": {
        "comfortable": "{spaceS}",
        "compact": "{spaceS}"
      },
      "spaceFlashbarDismissRight": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceFlashbarHorizontal": {
        "comfortable": "{spaceM}",
        "compact": "{spaceM}"
      },
      "spaceGridGutter": {
        "comfortable": "{spaceL}",
        "compact": "{spaceM}"
      },
      "spaceKeyValueGap": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceLayoutContentBottom": {
        "comfortable": "{spaceScaled2xXxxl}",
        "compact": "{spaceScaled2xXxxl}"
      },
      "spaceLayoutContentHorizontal": {
        "comfortable": "{spaceScaled2xXl}",
        "compact": "{spaceScaled2xXl}"
      },
      "spaceLayoutToggleDiameter": {
        "comfortable": "36px",
        "compact": "36px"
      },
      "spaceLayoutTogglePadding": {
        "comfortable": "{spaceStaticS}",
        "compact": "{spaceStaticS}"
      },
      "spaceModalContentBottom": {
        "comfortable": "{spaceScaled2xM}",
        "compact": "{spaceScaled2xM}"
      },
      "spaceModalHorizontal": {
        "comfortable": "{spaceContainerHorizontal}",
        "compact": "{spaceContainerHorizontal}"
      },
      "spaceOptionIconBigTop": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spacePanelContentBottom": {
        "comfortable": "{spaceScaledXxxl}",
        "compact": "{spaceScaledXxxl}"
      },
      "spacePanelContentTop": {
        "comfortable": "{spaceScaledL}",
        "compact": "{spaceScaledL}"
      },
      "spacePanelDividerMarginHorizontal": {
        "comfortable": "{spaceXs}",
        "compact": "{spaceXs}"
      },
      "spacePanelHeaderVertical": {
        "comfortable": "{spaceScaledL}",
        "compact": "{spaceScaledL}"
      },
      "spacePanelNavLeft": {
        "comfortable": "28px",
        "compact": "28px"
      },
      "spacePanelSideLeft": {
        "comfortable": "28px",
        "compact": "28px"
      },
      "spacePanelSideRight": {
        "comfortable": "{spaceScaledXl}",
        "compact": "{spaceScaledXl}"
      },
      "spacePanelSplitTop": {
        "comfortable": "{spaceScaledL}",
        "compact": "{spaceScaledL}"
      },
      "spacePanelSplitBottom": {
        "comfortable": "{spaceScaledL}",
        "compact": "{spaceScaledL}"
      },
      "spaceSegmentedControlFocusOutlineGutter": {
        "comfortable": "4px",
        "compact": "4px"
      },
      "spaceTabsContentTop": {
        "comfortable": "{spaceScaledS}",
        "compact": "{spaceScaledS}"
      },
      "spaceTabsFocusOutlineGutter": {
        "comfortable": "-8px",
        "compact": "-8px"
      },
      "spaceTableContentBottom": {
        "comfortable": "{spaceXxs}",
        "compact": "{spaceXxs}"
      },
      "spaceTableEmbeddedHeaderTop": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceTableFooterHorizontal": {
        "comfortable": "{spaceTableHeaderHorizontal}",
        "compact": "{spaceTableHeaderHorizontal}"
      },
      "spaceTableHeaderFocusOutlineGutter": {
        "comfortable": "0px",
        "compact": "-1px"
      },
      "spaceTableHeaderHorizontal": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceTableHeaderToolsBottom": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceTableHeaderToolsFullPageBottom": {
        "comfortable": "4px",
        "compact": "4px"
      },
      "spaceTableHorizontal": {
        "comfortable": "{spaceContainerHorizontal}",
        "compact": "{spaceContainerHorizontal}"
      },
      "spaceTileGutter": {
        "comfortable": "{spaceXl}",
        "compact": "{spaceM}"
      },
      "spaceScaled2xNone": {
        "comfortable": "{spaceNone}",
        "compact": "{spaceNone}"
      },
      "spaceScaled2xXxxs": {
        "comfortable": "{spaceXxxs}",
        "compact": "{spaceNone}"
      },
      "spaceScaled2xXxs": {
        "comfortable": "{spaceXxs}",
        "compact": "{spaceNone}"
      },
      "spaceScaled2xXs": {
        "comfortable": "{spaceXs}",
        "compact": "{spaceNone}"
      },
      "spaceScaled2xS": {
        "comfortable": "{spaceS}",
        "compact": "{spaceXxs}"
      },
      "spaceScaled2xM": {
        "comfortable": "{spaceM}",
        "compact": "{spaceXs}"
      },
      "spaceScaled2xL": {
        "comfortable": "{spaceL}",
        "compact": "{spaceS}"
      },
      "spaceScaled2xXl": {
        "comfortable": "{spaceXl}",
        "compact": "{spaceM}"
      },
      "spaceScaled2xXxl": {
        "comfortable": "{spaceXxl}",
        "compact": "{spaceL}"
      },
      "spaceScaled2xXxxl": {
        "comfortable": "{spaceXxxl}",
        "compact": "{spaceXl}"
      },
      "spaceScaledNone": {
        "comfortable": "{spaceNone}",
        "compact": "{spaceNone}"
      },
      "spaceScaledXxxs": {
        "comfortable": "{spaceXxxs}",
        "compact": "{spaceNone}"
      },
      "spaceScaledXxs": {
        "comfortable": "{spaceXxs}",
        "compact": "{spaceXxxs}"
      },
      "spaceScaledXs": {
        "comfortable": "{spaceXs}",
        "compact": "{spaceXxs}"
      },
      "spaceScaledS": {
        "comfortable": "{spaceS}",
        "compact": "{spaceXs}"
      },
      "spaceScaledM": {
        "comfortable": "{spaceM}",
        "compact": "{spaceS}"
      },
      "spaceScaledL": {
        "comfortable": "{spaceL}",
        "compact": "{spaceM}"
      },
      "spaceScaledXl": {
        "comfortable": "{spaceXl}",
        "compact": "{spaceL}"
      },
      "spaceScaledXxl": {
        "comfortable": "{spaceXxl}",
        "compact": "{spaceXl}"
      },
      "spaceScaledXxxl": {
        "comfortable": "{spaceXxxl}",
        "compact": "{spaceXxl}"
      },
      "spaceStaticXxxs": {
        "comfortable": "{spaceXxxs}",
        "compact": "{spaceXxxs}"
      },
      "spaceStaticXxs": {
        "comfortable": "{spaceXxs}",
        "compact": "{spaceXxs}"
      },
      "spaceStaticXs": {
        "comfortable": "{spaceXs}",
        "compact": "{spaceXs}"
      },
      "spaceStaticS": {
        "comfortable": "{spaceS}",
        "compact": "{spaceS}"
      },
      "spaceStaticM": {
        "comfortable": "{spaceM}",
        "compact": "{spaceM}"
      },
      "spaceStaticL": {
        "comfortable": "{spaceL}",
        "compact": "{spaceL}"
      },
      "spaceStaticXl": {
        "comfortable": "{spaceXl}",
        "compact": "{spaceXl}"
      },
      "spaceStaticXxl": {
        "comfortable": "{spaceXxl}",
        "compact": "{spaceXxl}"
      },
      "spaceStaticXxxl": {
        "comfortable": "{spaceXxxl}",
        "compact": "{spaceXxxl}"
      },
      "spaceNone": {
        "comfortable": "0px",
        "compact": "0px"
      },
      "spaceXxxs": {
        "comfortable": "2px",
        "compact": "2px"
      },
      "spaceXxs": {
        "comfortable": "4px",
        "compact": "4px"
      },
      "spaceXs": {
        "comfortable": "8px",
        "compact": "8px"
      },
      "spaceS": {
        "comfortable": "12px",
        "compact": "12px"
      },
      "spaceM": {
        "comfortable": "16px",
        "compact": "16px"
      },
      "spaceL": {
        "comfortable": "20px",
        "compact": "20px"
      },
      "spaceXl": {
        "comfortable": "24px",
        "compact": "24px"
      },
      "spaceXxl": {
        "comfortable": "32px",
        "compact": "32px"
      },
      "spaceXxxl": {
        "comfortable": "40px",
        "compact": "40px"
      },
      "shadowContainer": {
        "light": "0px 0px 1px 1px #e9ebed, 0px 1px 8px 2px rgba(0, 7, 22, 0.12)",
        "dark": "0px 1px 8px 2px rgba(0, 7, 22, 0.6)"
      },
      "shadowContainerStacked": {
        "light": "-1px 1px 1px 0px #e9ebed, 1px 1px 1px 0px #e9ebed, 0px 9px 8px -7px rgb(0 7 22 / 12%), 8px 0px 8px -7px rgb(0 7 22 / 12%), -8px 0px 8px -7px rgb(0 7 22 / 12%)",
        "dark": "0px 9px 8px -7px rgb(0 7 22 / 60%), 8px 0px 8px -7px rgb(0 7 22 / 60%), -8px 0px 8px -7px rgb(0 7 22 / 60%)"
      },
      "shadowContainerActive": {
        "light": "0px 1px 1px 1px #e9ebed, 0px 6px 36px #0007161a",
        "dark": "0px 1px 1px 1px #192534, 0px 6px 36px #00040c"
      },
      "shadowDropdown": {
        "light": "0px 4px 20px 1px rgba(0, 7, 22, 0.10)",
        "dark": "0px 4px 20px 1px rgba(0, 4, 12, 1)"
      },
      "shadowDropup": {
        "light": "{shadowDropdown}",
        "dark": "{shadowDropdown}"
      },
      "shadowFlashCollapsed": {
        "light": "0px 4px 4px rgba(0, 0, 0, 0.25)",
        "dark": "0px 4px 4px rgba(0, 0, 0, 0.25)"
      },
      "shadowFlashSticky": {
        "light": "0px 4px 8px rgba(0, 7, 22, 0.10)",
        "dark": "0px 4px 8px rgba(0, 7, 22, 0.5)"
      },
      "shadowModal": {
        "light": "{shadowDropdown}",
        "dark": "{shadowDropdown}"
      },
      "shadowPanel": {
        "light": "0px 0px 0px 1px #b6bec9",
        "dark": "0px 0px 0px 1px #414d5c"
      },
      "shadowPanelToggle": {
        "light": "0px 6px 12px 1px rgba(0, 7, 22, 0.12)",
        "dark": "0px 6px 12px 1px rgba(0, 7, 22, 1)"
      },
      "shadowPopover": {
        "light": "{shadowDropdown}",
        "dark": "{shadowDropdown}"
      },
      "shadowSplitBottom": {
        "light": "0px -36px 36px -36px rgba(0, 7, 22, 0.10)",
        "dark": "0px -36px 36px -36px rgba(0, 7, 22, 1)"
      },
      "shadowSplitSide": {
        "light": "-1px 0px 1px 0px #e9ebed, -36px 6px 36px -36px rgba(0, 7, 22, 0.10)",
        "dark": "-1px 0px 1px 0px #192534, -36px 6px 36px -36px rgba(0, 7, 22, 1)"
      },
      "shadowSticky": {
        "light": "0px 4px 8px 1px rgba(0, 7, 22, 0.10)",
        "dark": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)"
      },
      "shadowStickyEmbedded": {
        "light": "0px 2px 0px 0px #e9ebed, 0px 16px 16px -12px rgba(0, 7, 22, 0.10)",
        "dark": "0px 2px 0px 0px #414d5c, 0px 16px 16px -12px rgba(0, 7, 22, 1)"
      },
      "shadowStickyColumnFirst": {
        "light": "4px 0px 8px 1px rgba(0, 7, 22, 0.1)",
        "dark": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)"
      },
      "shadowStickyColumnLast": {
        "light": "-4px 0 8px 1px rgba(0, 28, 36, 0.1)",
        "dark": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)"
      }
    },
    "contexts": {
      "compact-table": {
        "id": "compact-table",
        "selector": ".awsui-context-compact-table",
        "tokens": {
          "spaceAlertActionLeft": {
            "comfortable": "{spaceS}",
            "compact": "{spaceS}"
          },
          "spaceAlertHorizontal": {
            "comfortable": "{spaceFlashbarHorizontal}",
            "compact": "{spaceFlashbarHorizontal}"
          },
          "spaceAlertMessageRight": {
            "comfortable": "{spaceXxs}",
            "compact": "{spaceXxs}"
          },
          "spaceAlertVertical": {
            "comfortable": "{spaceScaledXs}",
            "compact": "{spaceScaledXs}"
          },
          "spaceButtonFocusOutlineGutter": {
            "comfortable": "4px",
            "compact": "4px"
          },
          "spaceButtonHorizontal": {
            "comfortable": "{spaceScaledL}",
            "compact": "{spaceScaledL}"
          },
          "spaceButtonIconFocusOutlineGutterVertical": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceButtonIconOnlyHorizontal": {
            "comfortable": "6px",
            "compact": "{spaceXxs}"
          },
          "spaceButtonInlineIconFocusOutlineGutter": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceButtonModalDismissVertical": {
            "comfortable": "{spaceScaledXxxs}",
            "compact": "{spaceScaledXxxs}"
          },
          "spaceCalendarGridFocusOutlineGutter": {
            "comfortable": "-5px",
            "compact": "-5px"
          },
          "spaceCalendarGridSelectedFocusOutlineGutter": {
            "comfortable": "{spaceCalendarGridFocusOutlineGutter}",
            "compact": "{spaceCalendarGridFocusOutlineGutter}"
          },
          "spaceCalendarGridGutter": {
            "comfortable": "6px",
            "compact": "6px"
          },
          "spaceCardHorizontal": {
            "comfortable": "{spaceContainerHorizontal}",
            "compact": "{spaceContainerHorizontal}"
          },
          "spaceCardVertical": {
            "comfortable": "{spaceScaledM}",
            "compact": "{spaceScaledM}"
          },
          "spaceCodeEditorStatusFocusOutlineGutter": {
            "comfortable": "-7px",
            "compact": "-7px"
          },
          "spaceContainerContentTop": {
            "comfortable": "{spaceXxs}",
            "compact": "{spaceXxs}"
          },
          "spaceContainerHeaderTop": {
            "comfortable": "{spaceS}",
            "compact": "{spaceS}"
          },
          "spaceContainerHeaderBottom": {
            "comfortable": "{spaceScaledXs}",
            "compact": "{spaceScaledXs}"
          },
          "spaceContainerHorizontal": {
            "comfortable": "{spaceL}",
            "compact": "{spaceL}"
          },
          "spaceContentHeaderPaddingBottom": {
            "comfortable": "{spaceScaledM}",
            "compact": "{spaceScaledM}"
          },
          "spaceDarkHeaderOverlapDistance": {
            "comfortable": "36px",
            "compact": "32px"
          },
          "spaceExpandableSectionIconOffsetTop": {
            "comfortable": "{spaceScaled2xXxs}",
            "compact": "{spaceScaled2xXxs}"
          },
          "spaceFieldHorizontal": {
            "comfortable": "{spaceS}",
            "compact": "{spaceS}"
          },
          "spaceFieldIconOffset": {
            "comfortable": "36px",
            "compact": "36px"
          },
          "spaceFilteringTokenDismissButtonFocusOutlineGutter": {
            "comfortable": "-5px",
            "compact": "-5px"
          },
          "spaceFilteringTokenOperationSelectFocusOutlineGutter": {
            "comfortable": "-5px",
            "compact": "-5px"
          },
          "spaceFlashbarActionLeft": {
            "comfortable": "{spaceS}",
            "compact": "{spaceS}"
          },
          "spaceFlashbarDismissRight": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceFlashbarHorizontal": {
            "comfortable": "{spaceM}",
            "compact": "{spaceM}"
          },
          "spaceGridGutter": {
            "comfortable": "{spaceL}",
            "compact": "{spaceM}"
          },
          "spaceKeyValueGap": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceLayoutContentBottom": {
            "comfortable": "{spaceScaled2xXxxl}",
            "compact": "{spaceScaled2xXxxl}"
          },
          "spaceLayoutContentHorizontal": {
            "comfortable": "{spaceScaled2xXl}",
            "compact": "{spaceScaled2xXl}"
          },
          "spaceLayoutToggleDiameter": {
            "comfortable": "36px",
            "compact": "36px"
          },
          "spaceLayoutTogglePadding": {
            "comfortable": "{spaceStaticS}",
            "compact": "{spaceStaticS}"
          },
          "spaceModalContentBottom": {
            "comfortable": "{spaceScaled2xM}",
            "compact": "{spaceScaled2xM}"
          },
          "spaceModalHorizontal": {
            "comfortable": "{spaceContainerHorizontal}",
            "compact": "{spaceContainerHorizontal}"
          },
          "spaceOptionIconBigTop": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spacePanelContentBottom": {
            "comfortable": "{spaceScaledXxxl}",
            "compact": "{spaceScaledXxxl}"
          },
          "spacePanelContentTop": {
            "comfortable": "{spaceScaledL}",
            "compact": "{spaceScaledL}"
          },
          "spacePanelDividerMarginHorizontal": {
            "comfortable": "{spaceXs}",
            "compact": "{spaceXs}"
          },
          "spacePanelHeaderVertical": {
            "comfortable": "{spaceScaledL}",
            "compact": "{spaceScaledL}"
          },
          "spacePanelNavLeft": {
            "comfortable": "28px",
            "compact": "28px"
          },
          "spacePanelSideLeft": {
            "comfortable": "28px",
            "compact": "28px"
          },
          "spacePanelSideRight": {
            "comfortable": "{spaceScaledXl}",
            "compact": "{spaceScaledXl}"
          },
          "spacePanelSplitTop": {
            "comfortable": "{spaceScaledL}",
            "compact": "{spaceScaledL}"
          },
          "spacePanelSplitBottom": {
            "comfortable": "{spaceScaledL}",
            "compact": "{spaceScaledL}"
          },
          "spaceSegmentedControlFocusOutlineGutter": {
            "comfortable": "4px",
            "compact": "4px"
          },
          "spaceTabsContentTop": {
            "comfortable": "{spaceScaledS}",
            "compact": "{spaceScaledS}"
          },
          "spaceTabsFocusOutlineGutter": {
            "comfortable": "-8px",
            "compact": "-8px"
          },
          "spaceTableContentBottom": {
            "comfortable": "{spaceXxs}",
            "compact": "{spaceXxs}"
          },
          "spaceTableEmbeddedHeaderTop": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceTableFooterHorizontal": {
            "comfortable": "{spaceTableHeaderHorizontal}",
            "compact": "{spaceTableHeaderHorizontal}"
          },
          "spaceTableHeaderFocusOutlineGutter": {
            "comfortable": "0px",
            "compact": "-1px"
          },
          "spaceTableHeaderHorizontal": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceTableHeaderToolsBottom": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceTableHeaderToolsFullPageBottom": {
            "comfortable": "4px",
            "compact": "4px"
          },
          "spaceTableHorizontal": {
            "comfortable": "{spaceContainerHorizontal}",
            "compact": "{spaceContainerHorizontal}"
          },
          "spaceTileGutter": {
            "comfortable": "{spaceXl}",
            "compact": "{spaceM}"
          },
          "spaceScaled2xNone": {
            "comfortable": "{spaceNone}",
            "compact": "{spaceNone}"
          },
          "spaceScaled2xXxxs": {
            "comfortable": "{spaceXxxs}",
            "compact": "{spaceNone}"
          },
          "spaceScaled2xXxs": {
            "comfortable": "{spaceXxs}",
            "compact": "{spaceNone}"
          },
          "spaceScaled2xXs": {
            "comfortable": "{spaceXs}",
            "compact": "{spaceNone}"
          },
          "spaceScaled2xS": {
            "comfortable": "{spaceS}",
            "compact": "{spaceXxs}"
          },
          "spaceScaled2xM": {
            "comfortable": "{spaceM}",
            "compact": "{spaceXs}"
          },
          "spaceScaled2xL": {
            "comfortable": "{spaceL}",
            "compact": "{spaceS}"
          },
          "spaceScaled2xXl": {
            "comfortable": "{spaceXl}",
            "compact": "{spaceM}"
          },
          "spaceScaled2xXxl": {
            "comfortable": "{spaceXxl}",
            "compact": "{spaceL}"
          },
          "spaceScaled2xXxxl": {
            "comfortable": "{spaceXxxl}",
            "compact": "{spaceXl}"
          },
          "spaceScaledNone": {
            "comfortable": "{spaceNone}",
            "compact": "{spaceNone}"
          },
          "spaceScaledXxxs": {
            "comfortable": "{spaceNone}",
            "compact": "{spaceNone}"
          },
          "spaceScaledXxs": {
            "comfortable": "{spaceXxxs}",
            "compact": "{spaceXxxs}"
          },
          "spaceScaledXs": {
            "comfortable": "{spaceXxs}",
            "compact": "{spaceXxs}"
          },
          "spaceScaledS": {
            "comfortable": "{spaceXs}",
            "compact": "{spaceXs}"
          },
          "spaceScaledM": {
            "comfortable": "{spaceS}",
            "compact": "{spaceS}"
          },
          "spaceScaledL": {
            "comfortable": "{spaceM}",
            "compact": "{spaceM}"
          },
          "spaceScaledXl": {
            "comfortable": "{spaceL}",
            "compact": "{spaceL}"
          },
          "spaceScaledXxl": {
            "comfortable": "{spaceXl}",
            "compact": "{spaceXl}"
          },
          "spaceScaledXxxl": {
            "comfortable": "{spaceXxl}",
            "compact": "{spaceXxl}"
          },
          "spaceStaticXxxs": {
            "comfortable": "{spaceXxxs}",
            "compact": "{spaceXxxs}"
          },
          "spaceStaticXxs": {
            "comfortable": "{spaceXxs}",
            "compact": "{spaceXxs}"
          },
          "spaceStaticXs": {
            "comfortable": "{spaceXs}",
            "compact": "{spaceXs}"
          },
          "spaceStaticS": {
            "comfortable": "{spaceS}",
            "compact": "{spaceS}"
          },
          "spaceStaticM": {
            "comfortable": "{spaceM}",
            "compact": "{spaceM}"
          },
          "spaceStaticL": {
            "comfortable": "{spaceL}",
            "compact": "{spaceL}"
          },
          "spaceStaticXl": {
            "comfortable": "{spaceXl}",
            "compact": "{spaceXl}"
          },
          "spaceStaticXxl": {
            "comfortable": "{spaceXxl}",
            "compact": "{spaceXxl}"
          },
          "spaceStaticXxxl": {
            "comfortable": "{spaceXxxl}",
            "compact": "{spaceXxxl}"
          },
          "spaceNone": {
            "comfortable": "0px",
            "compact": "0px"
          },
          "spaceXxxs": {
            "comfortable": "2px",
            "compact": "2px"
          },
          "spaceXxs": {
            "comfortable": "4px",
            "compact": "4px"
          },
          "spaceXs": {
            "comfortable": "8px",
            "compact": "8px"
          },
          "spaceS": {
            "comfortable": "12px",
            "compact": "12px"
          },
          "spaceM": {
            "comfortable": "16px",
            "compact": "16px"
          },
          "spaceL": {
            "comfortable": "20px",
            "compact": "20px"
          },
          "spaceXl": {
            "comfortable": "24px",
            "compact": "24px"
          },
          "spaceXxl": {
            "comfortable": "32px",
            "compact": "32px"
          },
          "spaceXxxl": {
            "comfortable": "40px",
            "compact": "40px"
          },
          "sizeVerticalInput": {
            "comfortable": "28px",
            "compact": "28px"
          }
        }
      },
      "top-navigation": {
        "id": "top-navigation",
        "selector": ".awsui-context-top-navigation",
        "tokens": {
          "colorGreyOpaque10": {
            "light": "rgba(0, 0, 0, 0.1)",
            "dark": "rgba(0, 0, 0, 0.1)"
          },
          "colorGreyOpaque25": {
            "light": "rgba(255, 255, 255, 0.25)",
            "dark": "rgba(255, 255, 255, 0.25)"
          },
          "colorGreyOpaque40": {
            "light": "rgba(0, 0, 0, 0.4)",
            "dark": "rgba(0, 0, 0, 0.4)"
          },
          "colorGreyOpaque50": {
            "light": "rgba(0, 0, 0, 0.5)",
            "dark": "rgba(0, 0, 0, 0.5)"
          },
          "colorGreyOpaque70": {
            "light": "rgba(15, 20, 26, 0.7)",
            "dark": "rgba(15, 20, 26, 0.7)"
          },
          "colorGreyOpaque80": {
            "light": "rgba(22, 25, 31, 0.8)",
            "dark": "rgba(22, 25, 31, 0.8)"
          },
          "colorGreyOpaque90": {
            "light": "rgba(242, 243, 243, 0.9)",
            "dark": "rgba(242, 243, 243, 0.9)"
          },
          "colorGreyTransparent": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentHeavy": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentLight": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorBackgroundBadgeIcon": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundButtonLinkActive": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonLinkHover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundButtonNormalActive": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonNormalDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundButtonNormalDisabled": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundButtonNormalHover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleButtonNormalPressed": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonPrimaryActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundButtonPrimaryDefault": {
            "light": "{colorBorderButtonNormalDefault}",
            "dark": "{colorBorderButtonNormalDefault}"
          },
          "colorBackgroundButtonPrimaryDisabled": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundButtonPrimaryHover": {
            "light": "{colorBorderButtonNormalHover}",
            "dark": "{colorBorderButtonNormalHover}"
          },
          "colorBackgroundCalendarCurrentDate": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCellShaded": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundCodeEditorGutterActiveLineError": {
            "light": "{colorTextStatusError}",
            "dark": "{colorTextStatusError}"
          },
          "colorBackgroundCodeEditorGutterDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorLoading": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorPaneItemHover": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCodeEditorStatusBar": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundContainerContent": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundContainerHeader": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlChecked": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundControlDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlDisabled": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundDropdownItemDimmed": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundDropdownItemFilterMatch": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemHover": {
            "light": "{colorGrey850}",
            "dark": "{colorGrey850}"
          },
          "colorBackgroundDropdownItemSelected": {
            "light": "{colorBackgroundItemSelected}",
            "dark": "{colorBackgroundItemSelected}"
          },
          "colorBackgroundHomeHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundInputDisabled": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundItemSelected": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundLayoutMain": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundLayoutMobilePanel": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutPanelContent": {
            "light": "{colorBackgroundContainerContent}",
            "dark": "{colorBackgroundContainerContent}"
          },
          "colorBackgroundLayoutPanelHover": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundLayoutToggleActive": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundLayoutToggleSelectedActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundModalOverlay": {
            "light": "{colorGreyOpaque70}",
            "dark": "{colorGreyOpaque70}"
          },
          "colorBackgroundNotificationBlue": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorBackgroundNotificationGreen": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen600}"
          },
          "colorBackgroundNotificationGrey": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundNotificationRed": {
            "light": "{colorRed600}",
            "dark": "{colorRed600}"
          },
          "colorBackgroundNotificationYellow": {
            "light": "{colorYellow600}",
            "dark": "{colorYellow600}"
          },
          "colorBackgroundNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarActive": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundPopover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundProgressBarContentDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundProgressBarContentInFlash": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundProgressBarLayoutDefault": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundProgressBarLayoutInFlash": {
            "light": "{colorGreyOpaque25}",
            "dark": "{colorGreyOpaque25}"
          },
          "colorBackgroundSegmentActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSegmentDefault": {
            "light": "{colorBackgroundButtonNormalDefault}",
            "dark": "{colorBackgroundButtonNormalDefault}"
          },
          "colorBackgroundSegmentDisabled": {
            "light": "{colorBackgroundButtonNormalDisabled}",
            "dark": "{colorBackgroundButtonNormalDisabled}"
          },
          "colorBackgroundSegmentHover": {
            "light": "{colorBackgroundSegmentDefault}",
            "dark": "{colorBackgroundSegmentDefault}"
          },
          "colorBackgroundSliderHandleDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSliderHandleActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundSliderTrack": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundSliderHandleRing": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundSliderErrorPressed": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundSliderWarningPressed": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorBackgroundStatusError": {
            "light": "{colorRed900}",
            "dark": "{colorRed900}"
          },
          "colorBackgroundStatusInfo": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundStatusSuccess": {
            "light": "{colorGreen900}",
            "dark": "{colorGreen900}"
          },
          "colorBackgroundStatusWarning": {
            "light": "{colorYellow900}",
            "dark": "{colorYellow900}"
          },
          "colorBackgroundTableHeader": {
            "light": "{colorBackgroundContainerHeader}",
            "dark": "{colorBackgroundContainerHeader}"
          },
          "colorBackgroundTilesDisabled": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleCheckedDisabled": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue800}"
          },
          "colorBackgroundToggleDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundAvatarGenAi": {
            "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
            "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
          },
          "colorBackgroundAvatarDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextAvatar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundLoadingBarGenAi": {
            "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
            "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
          },
          "colorBackgroundChatBubbleOutgoing": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundChatBubbleIncoming": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextChatBubbleOutgoing": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorTextChatBubbleIncoming": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorBorderButtonNormalActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBorderButtonNormalDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderToggleButtonNormalPressed": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderButtonNormalDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextButtonNormalDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderButtonNormalHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBorderButtonPrimaryDisabled": {
            "light": "{colorBackgroundButtonPrimaryDisabled}",
            "dark": "{colorBackgroundButtonPrimaryDisabled}"
          },
          "colorTextButtonPrimaryDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderCalendarGrid": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderCalendarGridSelectedFocusRing": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBorderCodeEditorAceActiveLineLightTheme": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderCodeEditorAceActiveLineDarkTheme": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorPaneItemHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderContainerDivider": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderContainerTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderControlChecked": {
            "light": "{colorBackgroundControlChecked}",
            "dark": "{colorBackgroundControlChecked}"
          },
          "colorBorderControlDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderControlDisabled": {
            "light": "{colorBackgroundControlDisabled}",
            "dark": "{colorBackgroundControlDisabled}"
          },
          "colorBorderDividerActive": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderDividerPanelBottom": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerPanelSide": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerSecondary": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderDropdownContainer": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownGroup": {
            "light": "{colorBorderDropdownItemDefault}",
            "dark": "{colorBorderDropdownItemDefault}"
          },
          "colorBorderDropdownItemDefault": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDropdownItemHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownItemDimmedHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderDropdownItemSelected": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderDropdownItemTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderEditableCellHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderInputDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderInputDisabled": {
            "light": "{colorBackgroundInputDisabled}",
            "dark": "{colorBackgroundInputDisabled}"
          },
          "colorBorderInputFocused": {
            "light": "{colorBlue300}",
            "dark": "{colorBlue300}"
          },
          "colorBorderItemFocused": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderDropdownItemFocused": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderItemPlaceholder": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderItemSelected": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderLayout": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderPanelHeader": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderPopover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderSegmentActive": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderSegmentDisabled": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentHover": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderStatusError": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBorderStatusInfo": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderStatusSuccess": {
            "light": "{colorGreen500}",
            "dark": "{colorGreen500}"
          },
          "colorBorderStatusWarning": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorBorderDividerInteractiveDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderTabsDivider": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderTabsShadow": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorBorderTabsUnderline": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorBorderTilesDisabled": {
            "light": "{colorBackgroundTilesDisabled}",
            "dark": "{colorBackgroundTilesDisabled}"
          },
          "colorBorderTutorial": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorForegroundControlDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorForegroundControlDisabled": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorForegroundControlReadOnly": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorShadowDefault": {
            "light": "{colorGreyTransparentHeavy}",
            "dark": "{colorGreyTransparentHeavy}"
          },
          "colorShadowMedium": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorShadowSide": {
            "light": "{colorGreyTransparentLight}",
            "dark": "{colorGreyTransparentLight}"
          },
          "colorStrokeChartLine": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorStrokeCodeEditorResizeHandler": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorStrokeCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorStrokeCodeEditorGutterActiveLineHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextAccent": {
            "light": "#00AA00",
            "dark": "#00AA00"
          },
          "colorTextBodyDefault": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextBodySecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextBreadcrumbCurrent": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorTextBreadcrumbIcon": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextButtonInlineIconDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextButtonNormalActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextToggleButtonNormalPressed": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextButtonNormalDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextButtonNormalHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkButtonNormalDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorTextLinkButtonNormalHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextLinkButtonNormalActive": {
            "light": "{colorTextButtonNormalActive}",
            "dark": "{colorTextButtonNormalActive}"
          },
          "colorTextButtonPrimaryActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextCalendarDateHover": {
            "light": "{colorTextDropdownItemDefault}",
            "dark": "{colorTextDropdownItemDefault}"
          },
          "colorTextCalendarDateSelected": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextCalendarMonth": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextCodeEditorGutterActiveLine": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextCodeEditorGutterDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextCodeEditorStatusBarDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextCodeEditorTabButtonError": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextColumnHeader": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextColumnSortingIcon": {
            "light": "{colorTextColumnHeader}",
            "dark": "{colorTextColumnHeader}"
          },
          "colorTextControlDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextCounter": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextDisabledInlineEdit": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextDropdownFooter": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownGroupLabel": {
            "light": "{colorTextGroupLabel}",
            "dark": "{colorTextGroupLabel}"
          },
          "colorTextDropdownItemDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextDropdownItemDimmed": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemFilterMatch": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextDropdownItemHighlighted": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextDropdownItemSecondary": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownItemSecondaryHover": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextEmpty": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionHover": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextExpandableSectionNavigationIconDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorTextInteractiveDefault}"
          },
          "colorTextFormDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextFormLabel": {
            "light": "{colorTextFormDefault}",
            "dark": "{colorTextFormDefault}"
          },
          "colorTextFormSecondary": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextGroupLabel": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextLabelGenAi": {
            "light": "{colorPurple400}",
            "dark": "{colorPurple400}"
          },
          "colorTextHeadingDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHeadingSecondary": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextHomeHeaderDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHomeHeaderSecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextIconCaret": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextIconSubtle": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextInputDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextInputPlaceholder": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextInputPlaceholderDisabled": {
            "light": "{colorTextInputDisabled}",
            "dark": "{colorTextInputDisabled}"
          },
          "colorTextInteractiveActive": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextInteractiveHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextToggleButtonIconPressed": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveInvertedDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveInvertedHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInverted": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLabel": {
            "light": "{colorTextFormLabel}",
            "dark": "{colorTextFormLabel}"
          },
          "colorTextLayoutToggle": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLayoutToggleActive": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorTextLayoutToggleHover": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextLayoutToggleSelected": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextLinkHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkInvertedHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonUnderline": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextLinkButtonUnderlineHover": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextNotificationDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextNotificationStackBar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextNotificationYellow": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextPaginationPageNumberActiveDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextPaginationPageNumberDefault": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextSegmentActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextSegmentDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextSegmentHover": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextSmall": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusError": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorTextStatusInactive": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusInfo": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextStatusSuccess": {
            "light": "{colorGreen500}",
            "dark": "{colorGreen500}"
          },
          "colorTextStatusWarning": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorTextTopNavigationTitle": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBoardPlaceholderActive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBoardPlaceholderHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorDragPlaceholderActive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorDragPlaceholderHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorDropzoneBackgroundDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorDropzoneBackgroundHover": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorDropzoneTextDefault": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneTextHover": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneBorderDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorDropzoneBorderHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          }
        }
      },
      "header": {
        "id": "header",
        "selector": ".awsui-context-content-header",
        "tokens": {
          "shadowContainer": {
            "light": "0px 1px 8px 2px rgba(0, 7, 22, 0.6)",
            "dark": "0px 1px 8px 2px rgba(0, 7, 22, 0.6)"
          },
          "shadowContainerStacked": {
            "light": "0px 9px 8px -7px rgb(0 7 22 / 60%), 8px 0px 8px -7px rgb(0 7 22 / 60%), -8px 0px 8px -7px rgb(0 7 22 / 60%)",
            "dark": "0px 9px 8px -7px rgb(0 7 22 / 60%), 8px 0px 8px -7px rgb(0 7 22 / 60%), -8px 0px 8px -7px rgb(0 7 22 / 60%)"
          },
          "shadowContainerActive": {
            "light": "0px 1px 1px 1px #192534, 0px 6px 36px #00040c",
            "dark": "0px 1px 1px 1px #192534, 0px 6px 36px #00040c"
          },
          "shadowDropdown": {
            "light": "0px 4px 20px 1px rgba(0, 4, 12, 1)",
            "dark": "0px 4px 20px 1px rgba(0, 4, 12, 1)"
          },
          "shadowDropup": {
            "light": "{shadowDropdown}",
            "dark": "{shadowDropdown}"
          },
          "shadowFlashCollapsed": {
            "light": "0px 4px 4px rgba(0, 0, 0, 0.25)",
            "dark": "0px 4px 4px rgba(0, 0, 0, 0.25)"
          },
          "shadowFlashSticky": {
            "light": "0px 4px 8px rgba(0, 7, 22, 0.10)",
            "dark": "0px 4px 8px rgba(0, 7, 22, 0.5)"
          },
          "shadowModal": {
            "light": "{shadowDropdown}",
            "dark": "{shadowDropdown}"
          },
          "shadowPanel": {
            "light": "0px 0px 0px 1px #b6bec9",
            "dark": "0px 0px 0px 1px #414d5c"
          },
          "shadowPanelToggle": {
            "light": "0px 6px 12px 1px rgba(0, 7, 22, 0.12)",
            "dark": "0px 6px 12px 1px rgba(0, 7, 22, 1)"
          },
          "shadowPopover": {
            "light": "{shadowDropdown}",
            "dark": "{shadowDropdown}"
          },
          "shadowSplitBottom": {
            "light": "0px -36px 36px -36px rgba(0, 7, 22, 1)",
            "dark": "0px -36px 36px -36px rgba(0, 7, 22, 1)"
          },
          "shadowSplitSide": {
            "light": "-1px 0px 1px 0px #192534, -36px 6px 36px -36px rgba(0, 7, 22, 1)",
            "dark": "-1px 0px 1px 0px #192534, -36px 6px 36px -36px rgba(0, 7, 22, 1)"
          },
          "shadowSticky": {
            "light": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)",
            "dark": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)"
          },
          "shadowStickyEmbedded": {
            "light": "0px 2px 0px 0px #414d5c, 0px 16px 16px -12px rgba(0, 7, 22, 1)",
            "dark": "0px 2px 0px 0px #414d5c, 0px 16px 16px -12px rgba(0, 7, 22, 1)"
          },
          "shadowStickyColumnFirst": {
            "light": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)",
            "dark": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)"
          },
          "shadowStickyColumnLast": {
            "light": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)",
            "dark": "0px 4px 8px 1px rgba(0, 7, 22, 0.5)"
          },
          "colorGreyOpaque10": {
            "light": "rgba(0, 0, 0, 0.1)",
            "dark": "rgba(0, 0, 0, 0.1)"
          },
          "colorGreyOpaque25": {
            "light": "rgba(255, 255, 255, 0.25)",
            "dark": "rgba(255, 255, 255, 0.25)"
          },
          "colorGreyOpaque40": {
            "light": "rgba(0, 0, 0, 0.4)",
            "dark": "rgba(0, 0, 0, 0.4)"
          },
          "colorGreyOpaque50": {
            "light": "rgba(0, 0, 0, 0.5)",
            "dark": "rgba(0, 0, 0, 0.5)"
          },
          "colorGreyOpaque70": {
            "light": "rgba(15, 20, 26, 0.7)",
            "dark": "rgba(15, 20, 26, 0.7)"
          },
          "colorGreyOpaque80": {
            "light": "rgba(22, 25, 31, 0.8)",
            "dark": "rgba(22, 25, 31, 0.8)"
          },
          "colorGreyOpaque90": {
            "light": "rgba(242, 243, 243, 0.9)",
            "dark": "rgba(242, 243, 243, 0.9)"
          },
          "colorGreyTransparent": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentHeavy": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentLight": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorBackgroundBadgeIcon": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundButtonLinkActive": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonLinkHover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundButtonNormalActive": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonNormalDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundButtonNormalDisabled": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundButtonNormalHover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleButtonNormalPressed": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonPrimaryActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundButtonPrimaryDefault": {
            "light": "{colorBorderButtonNormalDefault}",
            "dark": "{colorBorderButtonNormalDefault}"
          },
          "colorBackgroundButtonPrimaryDisabled": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundButtonPrimaryHover": {
            "light": "{colorBorderButtonNormalHover}",
            "dark": "{colorBorderButtonNormalHover}"
          },
          "colorBackgroundCalendarCurrentDate": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCellShaded": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundCodeEditorGutterActiveLineError": {
            "light": "{colorTextStatusError}",
            "dark": "{colorTextStatusError}"
          },
          "colorBackgroundCodeEditorGutterDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorLoading": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorPaneItemHover": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCodeEditorStatusBar": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundContainerContent": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundContainerHeader": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlChecked": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundControlDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundControlDisabled": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundDropdownItemDimmed": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundDropdownItemFilterMatch": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemHover": {
            "light": "{colorGrey850}",
            "dark": "{colorGrey850}"
          },
          "colorBackgroundDropdownItemSelected": {
            "light": "{colorBackgroundItemSelected}",
            "dark": "{colorBackgroundItemSelected}"
          },
          "colorBackgroundHomeHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDisabled": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundItemSelected": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundLayoutMain": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutMobilePanel": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutPanelContent": {
            "light": "{colorBackgroundContainerContent}",
            "dark": "{colorBackgroundContainerContent}"
          },
          "colorBackgroundLayoutPanelHover": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundLayoutToggleActive": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundLayoutToggleSelectedActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundModalOverlay": {
            "light": "{colorGreyOpaque70}",
            "dark": "{colorGreyOpaque70}"
          },
          "colorBackgroundNotificationBlue": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorBackgroundNotificationGreen": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen600}"
          },
          "colorBackgroundNotificationGrey": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundNotificationRed": {
            "light": "{colorRed600}",
            "dark": "{colorRed600}"
          },
          "colorBackgroundNotificationYellow": {
            "light": "{colorYellow600}",
            "dark": "{colorYellow600}"
          },
          "colorBackgroundNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarActive": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundPopover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundProgressBarContentDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundProgressBarContentInFlash": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundProgressBarLayoutDefault": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundProgressBarLayoutInFlash": {
            "light": "{colorGreyOpaque25}",
            "dark": "{colorGreyOpaque25}"
          },
          "colorBackgroundSegmentActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSegmentDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundSegmentDisabled": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundSegmentHover": {
            "light": "{colorBackgroundSegmentDefault}",
            "dark": "{colorBackgroundSegmentDefault}"
          },
          "colorBackgroundSliderHandleDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSliderHandleActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundSliderTrack": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundSliderHandleRing": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundSliderErrorPressed": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundSliderWarningPressed": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorBackgroundStatusError": {
            "light": "{colorRed900}",
            "dark": "{colorRed900}"
          },
          "colorBackgroundStatusInfo": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundStatusSuccess": {
            "light": "{colorGreen900}",
            "dark": "{colorGreen900}"
          },
          "colorBackgroundStatusWarning": {
            "light": "{colorYellow900}",
            "dark": "{colorYellow900}"
          },
          "colorBackgroundTableHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundTilesDisabled": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleCheckedDisabled": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue800}"
          },
          "colorBackgroundToggleDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundAvatarGenAi": {
            "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
            "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
          },
          "colorBackgroundAvatarDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextAvatar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundLoadingBarGenAi": {
            "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
            "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
          },
          "colorBackgroundChatBubbleOutgoing": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundChatBubbleIncoming": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextChatBubbleOutgoing": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorTextChatBubbleIncoming": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorBorderButtonNormalActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBorderButtonNormalDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderToggleButtonNormalPressed": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderButtonNormalDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextButtonNormalDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderButtonNormalHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBorderButtonPrimaryDisabled": {
            "light": "{colorBackgroundButtonPrimaryDisabled}",
            "dark": "{colorBackgroundButtonPrimaryDisabled}"
          },
          "colorTextButtonPrimaryDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderCalendarGrid": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderCalendarGridSelectedFocusRing": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBorderCodeEditorAceActiveLineLightTheme": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderCodeEditorAceActiveLineDarkTheme": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorPaneItemHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderContainerDivider": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderContainerTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderControlChecked": {
            "light": "{colorBackgroundControlChecked}",
            "dark": "{colorBackgroundControlChecked}"
          },
          "colorBorderControlDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderControlDisabled": {
            "light": "{colorBackgroundControlDisabled}",
            "dark": "{colorBackgroundControlDisabled}"
          },
          "colorBorderDividerActive": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderDividerPanelBottom": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerPanelSide": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerSecondary": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderDropdownContainer": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownGroup": {
            "light": "{colorBorderDropdownItemDefault}",
            "dark": "{colorBorderDropdownItemDefault}"
          },
          "colorBorderDropdownItemDefault": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDropdownItemHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownItemDimmedHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderDropdownItemSelected": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderDropdownItemTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderEditableCellHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderInputDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderInputDisabled": {
            "light": "{colorBackgroundInputDisabled}",
            "dark": "{colorBackgroundInputDisabled}"
          },
          "colorBorderInputFocused": {
            "light": "{colorBlue300}",
            "dark": "{colorBlue300}"
          },
          "colorBorderItemFocused": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderDropdownItemFocused": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderItemPlaceholder": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderItemSelected": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderLayout": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderPanelHeader": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderPopover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderSegmentActive": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderSegmentDisabled": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentHover": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderStatusError": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBorderStatusInfo": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderStatusSuccess": {
            "light": "{colorGreen500}",
            "dark": "{colorGreen500}"
          },
          "colorBorderStatusWarning": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorBorderDividerInteractiveDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderTabsDivider": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderTabsShadow": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorBorderTabsUnderline": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorBorderTilesDisabled": {
            "light": "{colorBackgroundTilesDisabled}",
            "dark": "{colorBackgroundTilesDisabled}"
          },
          "colorBorderTutorial": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorForegroundControlDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorForegroundControlDisabled": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorForegroundControlReadOnly": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorShadowDefault": {
            "light": "{colorGreyTransparentHeavy}",
            "dark": "{colorGreyTransparentHeavy}"
          },
          "colorShadowMedium": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorShadowSide": {
            "light": "{colorGreyTransparentLight}",
            "dark": "{colorGreyTransparentLight}"
          },
          "colorStrokeChartLine": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorStrokeCodeEditorResizeHandler": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorStrokeCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorStrokeCodeEditorGutterActiveLineHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextAccent": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextBodyDefault": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextBodySecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextBreadcrumbCurrent": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorTextBreadcrumbIcon": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextButtonInlineIconDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextButtonNormalActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextToggleButtonNormalPressed": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextButtonNormalDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextButtonNormalHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkButtonNormalDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorTextLinkButtonNormalHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextLinkButtonNormalActive": {
            "light": "{colorTextButtonNormalActive}",
            "dark": "{colorTextButtonNormalActive}"
          },
          "colorTextButtonPrimaryActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextCalendarDateHover": {
            "light": "{colorTextDropdownItemDefault}",
            "dark": "{colorTextDropdownItemDefault}"
          },
          "colorTextCalendarDateSelected": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextCalendarMonth": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextCodeEditorGutterActiveLine": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextCodeEditorGutterDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextCodeEditorStatusBarDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextCodeEditorTabButtonError": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextColumnHeader": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextColumnSortingIcon": {
            "light": "{colorTextColumnHeader}",
            "dark": "{colorTextColumnHeader}"
          },
          "colorTextControlDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextCounter": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextDisabledInlineEdit": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextDropdownFooter": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownGroupLabel": {
            "light": "{colorTextGroupLabel}",
            "dark": "{colorTextGroupLabel}"
          },
          "colorTextDropdownItemDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextDropdownItemDimmed": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemFilterMatch": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextDropdownItemHighlighted": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextDropdownItemSecondary": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownItemSecondaryHover": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextEmpty": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionHover": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextExpandableSectionNavigationIconDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorTextInteractiveDefault}"
          },
          "colorTextFormDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextFormLabel": {
            "light": "{colorTextFormDefault}",
            "dark": "{colorTextFormDefault}"
          },
          "colorTextFormSecondary": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextGroupLabel": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextLabelGenAi": {
            "light": "{colorPurple400}",
            "dark": "{colorPurple400}"
          },
          "colorTextHeadingDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHeadingSecondary": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextHomeHeaderDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHomeHeaderSecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextIconCaret": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextIconSubtle": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextInputDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextInputPlaceholder": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextInputPlaceholderDisabled": {
            "light": "{colorTextInputDisabled}",
            "dark": "{colorTextInputDisabled}"
          },
          "colorTextInteractiveActive": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextInteractiveHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextToggleButtonIconPressed": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveInvertedDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveInvertedHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInverted": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLabel": {
            "light": "{colorTextFormLabel}",
            "dark": "{colorTextFormLabel}"
          },
          "colorTextLayoutToggle": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLayoutToggleActive": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorTextLayoutToggleHover": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextLayoutToggleSelected": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextLinkHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkInvertedHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonUnderline": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextLinkButtonUnderlineHover": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextNotificationDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextNotificationStackBar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextNotificationYellow": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextPaginationPageNumberActiveDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextPaginationPageNumberDefault": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextSegmentActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextSegmentDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextSegmentHover": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextSmall": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusError": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorTextStatusInactive": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusInfo": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextStatusSuccess": {
            "light": "{colorGreen500}",
            "dark": "{colorGreen500}"
          },
          "colorTextStatusWarning": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorTextTopNavigationTitle": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBoardPlaceholderActive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBoardPlaceholderHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorDragPlaceholderActive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorDragPlaceholderHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorDropzoneBackgroundDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorDropzoneBackgroundHover": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorDropzoneTextDefault": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneTextHover": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneBorderDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorDropzoneBorderHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          }
        }
      },
      "flashbar": {
        "id": "flashbar",
        "selector": ".awsui-context-flashbar",
        "tokens": {
          "colorGreyOpaque10": {
            "light": "rgba(0, 0, 0, 0.1)",
            "dark": "rgba(0, 0, 0, 0.1)"
          },
          "colorGreyOpaque25": {
            "light": "rgba(255, 255, 255, 0.25)",
            "dark": "rgba(255, 255, 255, 0.25)"
          },
          "colorGreyOpaque40": {
            "light": "rgba(0, 0, 0, 0.4)",
            "dark": "rgba(0, 0, 0, 0.4)"
          },
          "colorGreyOpaque50": {
            "light": "rgba(0, 0, 0, 0.5)",
            "dark": "rgba(0, 0, 0, 0.5)"
          },
          "colorGreyOpaque70": {
            "light": "rgba(35, 43, 55, 0.7)",
            "dark": "rgba(15, 20, 26, 0.7)"
          },
          "colorGreyOpaque80": {
            "light": "rgba(22, 25, 31, 0.8)",
            "dark": "rgba(22, 25, 31, 0.8)"
          },
          "colorGreyOpaque90": {
            "light": "rgba(242, 243, 243, 0.9)",
            "dark": "rgba(242, 243, 243, 0.9)"
          },
          "colorGreyTransparent": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentHeavy": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentLight": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorBackgroundBadgeIcon": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundButtonLinkActive": {
            "light": "{colorBlue200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonLinkHover": {
            "light": "{colorBlue100}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundButtonNormalActive": {
            "light": "rgba(0, 7, 22, 0.2)",
            "dark": "rgba(0, 7, 22, 0.2)"
          },
          "colorBackgroundButtonNormalDefault": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundButtonNormalDisabled": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundButtonNormalHover": {
            "light": "rgba(0, 7, 22, 0.15)",
            "dark": "rgba(0, 7, 22, 0.15)"
          },
          "colorBackgroundToggleButtonNormalPressed": {
            "light": "{colorBlue200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonPrimaryActive": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundButtonPrimaryDefault": {
            "light": "{colorBorderButtonNormalDefault}",
            "dark": "{colorBorderButtonNormalDefault}"
          },
          "colorBackgroundButtonPrimaryDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundButtonPrimaryHover": {
            "light": "{colorBorderButtonNormalHover}",
            "dark": "{colorBorderButtonNormalHover}"
          },
          "colorBackgroundCalendarCurrentDate": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCellShaded": {
            "light": "{colorGrey125}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundCodeEditorGutterActiveLineError": {
            "light": "{colorTextStatusError}",
            "dark": "{colorTextStatusError}"
          },
          "colorBackgroundCodeEditorGutterDefault": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorLoading": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorPaneItemHover": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCodeEditorStatusBar": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundContainerContent": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundContainerHeader": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlChecked": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundControlDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlDisabled": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundDropdownItemDimmed": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundDropdownItemFilterMatch": {
            "light": "{colorBlue100}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemHover": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey850}"
          },
          "colorBackgroundDropdownItemSelected": {
            "light": "{colorBackgroundItemSelected}",
            "dark": "{colorBackgroundItemSelected}"
          },
          "colorBackgroundHomeHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundInputDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundItemSelected": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundLayoutMain": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundLayoutMobilePanel": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutPanelContent": {
            "light": "{colorBackgroundContainerContent}",
            "dark": "{colorBackgroundContainerContent}"
          },
          "colorBackgroundLayoutPanelHover": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundLayoutToggleActive": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundLayoutToggleSelectedActive": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedHover": {
            "light": "{colorBlue700}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundModalOverlay": {
            "light": "{colorGreyOpaque70}",
            "dark": "{colorGreyOpaque70}"
          },
          "colorBackgroundNotificationBlue": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorBackgroundNotificationGreen": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen600}"
          },
          "colorBackgroundNotificationGrey": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundNotificationRed": {
            "light": "{colorRed600}",
            "dark": "{colorRed600}"
          },
          "colorBackgroundNotificationYellow": {
            "light": "{colorYellow600}",
            "dark": "{colorYellow600}"
          },
          "colorBackgroundNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarActive": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundPopover": {
            "light": "{colorWhite}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundProgressBarContentDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundProgressBarContentInFlash": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundProgressBarLayoutDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundProgressBarLayoutInFlash": {
            "light": "{colorGreyOpaque25}",
            "dark": "{colorGreyOpaque25}"
          },
          "colorBackgroundSegmentActive": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSegmentDefault": {
            "light": "{colorBackgroundButtonNormalDefault}",
            "dark": "{colorBackgroundButtonNormalDefault}"
          },
          "colorBackgroundSegmentDisabled": {
            "light": "{colorBackgroundButtonNormalDisabled}",
            "dark": "{colorBackgroundButtonNormalDisabled}"
          },
          "colorBackgroundSegmentHover": {
            "light": "{colorBackgroundSegmentDefault}",
            "dark": "{colorBackgroundSegmentDefault}"
          },
          "colorBackgroundSliderHandleDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSliderHandleActive": {
            "light": "{colorBlue700}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundSliderTrack": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundSliderHandleRing": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundSliderErrorPressed": {
            "light": "{colorRed700}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundSliderWarningPressed": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorBackgroundStatusError": {
            "light": "{colorRed100}",
            "dark": "{colorRed900}"
          },
          "colorBackgroundStatusInfo": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundStatusSuccess": {
            "light": "{colorGreen100}",
            "dark": "{colorGreen900}"
          },
          "colorBackgroundStatusWarning": {
            "light": "{colorYellow100}",
            "dark": "{colorYellow900}"
          },
          "colorBackgroundTableHeader": {
            "light": "{colorBackgroundContainerHeader}",
            "dark": "{colorBackgroundContainerHeader}"
          },
          "colorBackgroundTilesDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleCheckedDisabled": {
            "light": "{colorBlue300}",
            "dark": "{colorBlue800}"
          },
          "colorBackgroundToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundAvatarGenAi": {
            "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
            "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
          },
          "colorBackgroundAvatarDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextAvatar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundLoadingBarGenAi": {
            "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
            "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
          },
          "colorBackgroundChatBubbleOutgoing": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundChatBubbleIncoming": {
            "light": "{colorGrey125}",
            "dark": "{colorGrey900}"
          },
          "colorTextChatBubbleOutgoing": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorTextChatBubbleIncoming": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorBorderButtonNormalActive": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBorderButtonNormalDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderToggleButtonNormalPressed": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderButtonNormalDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextButtonNormalDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderButtonNormalHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBorderButtonPrimaryDisabled": {
            "light": "{colorBackgroundButtonPrimaryDisabled}",
            "dark": "{colorBackgroundButtonPrimaryDisabled}"
          },
          "colorTextButtonPrimaryDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderCalendarGrid": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderCalendarGridSelectedFocusRing": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey800}"
          },
          "colorBorderCodeEditorAceActiveLineLightTheme": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderCodeEditorAceActiveLineDarkTheme": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorPaneItemHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderContainerDivider": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderContainerTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderControlChecked": {
            "light": "{colorBackgroundControlChecked}",
            "dark": "{colorBackgroundControlChecked}"
          },
          "colorBorderControlDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderControlDisabled": {
            "light": "{colorBackgroundControlDisabled}",
            "dark": "{colorBackgroundControlDisabled}"
          },
          "colorBorderDividerActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerPanelBottom": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerPanelSide": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerSecondary": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey700}"
          },
          "colorBorderDropdownContainer": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownGroup": {
            "light": "{colorBorderDropdownItemDefault}",
            "dark": "{colorBorderDropdownItemDefault}"
          },
          "colorBorderDropdownItemDefault": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDropdownItemHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownItemDimmedHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderDropdownItemSelected": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderDropdownItemTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderEditableCellHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderInputDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBorderInputDisabled": {
            "light": "{colorBackgroundInputDisabled}",
            "dark": "{colorBackgroundInputDisabled}"
          },
          "colorBorderInputFocused": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue300}"
          },
          "colorBorderItemFocused": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDropdownItemFocused": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorBorderItemPlaceholder": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderItemSelected": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderLayout": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey600}"
          },
          "colorBorderNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderPanelHeader": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderPopover": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorBorderSegmentActive": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorBorderSegmentDisabled": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentHover": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderStatusError": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorBorderStatusInfo": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderStatusSuccess": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen500}"
          },
          "colorBorderStatusWarning": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorBorderDividerInteractiveDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey300}"
          },
          "colorBorderTabsDivider": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey600}"
          },
          "colorBorderTabsShadow": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorBorderTabsUnderline": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorBorderTilesDisabled": {
            "light": "{colorBackgroundTilesDisabled}",
            "dark": "{colorBackgroundTilesDisabled}"
          },
          "colorBorderTutorial": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey600}"
          },
          "colorForegroundControlDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorForegroundControlDisabled": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorForegroundControlReadOnly": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorShadowDefault": {
            "light": "{colorGreyTransparentHeavy}",
            "dark": "{colorGreyTransparentHeavy}"
          },
          "colorShadowMedium": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorShadowSide": {
            "light": "{colorGreyTransparentLight}",
            "dark": "{colorGreyTransparentLight}"
          },
          "colorStrokeChartLine": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorStrokeCodeEditorResizeHandler": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorStrokeCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey750}"
          },
          "colorStrokeCodeEditorGutterActiveLineHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey900}"
          },
          "colorTextAccent": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextBodyDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextBodySecondary": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorTextBreadcrumbCurrent": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey500}"
          },
          "colorTextBreadcrumbIcon": {
            "light": "{colorGrey500}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextButtonInlineIconDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextButtonNormalActive": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextToggleButtonNormalPressed": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "colorTextButtonNormalDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextButtonNormalHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonNormalDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorTextLinkButtonNormalHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextLinkButtonNormalActive": {
            "light": "{colorTextButtonNormalActive}",
            "dark": "{colorTextButtonNormalActive}"
          },
          "colorTextButtonPrimaryActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryHover": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextCalendarDateHover": {
            "light": "{colorTextDropdownItemDefault}",
            "dark": "{colorTextDropdownItemDefault}"
          },
          "colorTextCalendarDateSelected": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextCalendarMonth": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextCodeEditorGutterActiveLine": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextCodeEditorGutterDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextCodeEditorStatusBarDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorTextCodeEditorTabButtonError": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextColumnHeader": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey400}"
          },
          "colorTextColumnSortingIcon": {
            "light": "{colorTextColumnHeader}",
            "dark": "{colorTextColumnHeader}"
          },
          "colorTextControlDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextCounter": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextDisabledInlineEdit": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey400}"
          },
          "colorTextDropdownFooter": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownGroupLabel": {
            "light": "{colorTextGroupLabel}",
            "dark": "{colorTextGroupLabel}"
          },
          "colorTextDropdownItemDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextDropdownItemDimmed": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemFilterMatch": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue400}"
          },
          "colorTextDropdownItemHighlighted": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey200}"
          },
          "colorTextDropdownItemSecondary": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownItemSecondaryHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey300}"
          },
          "colorTextEmpty": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextExpandableSectionHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextExpandableSectionNavigationIconDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorTextInteractiveDefault}"
          },
          "colorTextFormDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextFormLabel": {
            "light": "{colorTextFormDefault}",
            "dark": "{colorTextFormDefault}"
          },
          "colorTextFormSecondary": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextGroupLabel": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorTextLabelGenAi": {
            "light": "{colorPurple600}",
            "dark": "{colorPurple400}"
          },
          "colorTextHeadingDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey200}"
          },
          "colorTextHeadingSecondary": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextHomeHeaderDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHomeHeaderSecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextIconCaret": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey450}"
          },
          "colorTextIconSubtle": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey400}"
          },
          "colorTextInputDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextInputPlaceholder": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextInputPlaceholderDisabled": {
            "light": "{colorTextInputDisabled}",
            "dark": "{colorTextInputDisabled}"
          },
          "colorTextInteractiveActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextInteractiveHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextToggleButtonIconPressed": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveInvertedDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveInvertedHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInverted": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextLabel": {
            "light": "{colorTextFormLabel}",
            "dark": "{colorTextFormLabel}"
          },
          "colorTextLayoutToggle": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLayoutToggleActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorTextLayoutToggleHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextLayoutToggleSelected": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextLinkHover": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkInvertedHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonUnderline": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextLinkButtonUnderlineHover": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextNotificationDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextNotificationStackBar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextNotificationYellow": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextPaginationPageNumberActiveDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextPaginationPageNumberDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorGrey400}"
          },
          "colorTextSegmentActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextSegmentDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextSegmentHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextSmall": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusError": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorTextStatusInactive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusInfo": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextStatusSuccess": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen500}"
          },
          "colorTextStatusWarning": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorTextTopNavigationTitle": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorBoardPlaceholderActive": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey550}"
          },
          "colorBoardPlaceholderHover": {
            "light": "{colorBlue200}",
            "dark": "{colorBlue600}"
          },
          "colorDragPlaceholderActive": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey550}"
          },
          "colorDragPlaceholderHover": {
            "light": "{colorBlue200}",
            "dark": "{colorBlue600}"
          },
          "colorDropzoneBackgroundDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorDropzoneBackgroundHover": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorDropzoneTextDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneTextHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneBorderDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorDropzoneBorderHover": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          }
        }
      },
      "flashbar-warning": {
        "id": "flashbar-warning",
        "selector": ".awsui-context-flashbar-warning",
        "tokens": {
          "colorGreyOpaque10": {
            "light": "rgba(0, 0, 0, 0.1)",
            "dark": "rgba(0, 0, 0, 0.1)"
          },
          "colorGreyOpaque25": {
            "light": "rgba(255, 255, 255, 0.25)",
            "dark": "rgba(255, 255, 255, 0.25)"
          },
          "colorGreyOpaque40": {
            "light": "rgba(0, 0, 0, 0.4)",
            "dark": "rgba(0, 0, 0, 0.4)"
          },
          "colorGreyOpaque50": {
            "light": "rgba(0, 0, 0, 0.5)",
            "dark": "rgba(0, 0, 0, 0.5)"
          },
          "colorGreyOpaque70": {
            "light": "rgba(35, 43, 55, 0.7)",
            "dark": "rgba(15, 20, 26, 0.7)"
          },
          "colorGreyOpaque80": {
            "light": "rgba(22, 25, 31, 0.8)",
            "dark": "rgba(22, 25, 31, 0.8)"
          },
          "colorGreyOpaque90": {
            "light": "rgba(242, 243, 243, 0.9)",
            "dark": "rgba(242, 243, 243, 0.9)"
          },
          "colorGreyTransparent": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentHeavy": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentLight": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorBackgroundBadgeIcon": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundButtonLinkActive": {
            "light": "{colorBlue200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonLinkHover": {
            "light": "{colorBlue100}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundButtonNormalActive": {
            "light": "rgba(0, 7, 22, 0.1)",
            "dark": "rgba(0, 7, 22, 0.1)"
          },
          "colorBackgroundButtonNormalDefault": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundButtonNormalDisabled": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundButtonNormalHover": {
            "light": "rgba(0, 7, 22, 0.05)",
            "dark": "rgba(0, 7, 22, 0.05)"
          },
          "colorBackgroundToggleButtonNormalPressed": {
            "light": "{colorBlue200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonPrimaryActive": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundButtonPrimaryDefault": {
            "light": "{colorBorderButtonNormalDefault}",
            "dark": "{colorBorderButtonNormalDefault}"
          },
          "colorBackgroundButtonPrimaryDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundButtonPrimaryHover": {
            "light": "{colorBorderButtonNormalHover}",
            "dark": "{colorBorderButtonNormalHover}"
          },
          "colorBackgroundCalendarCurrentDate": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCellShaded": {
            "light": "{colorGrey125}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundCodeEditorGutterActiveLineError": {
            "light": "{colorTextStatusError}",
            "dark": "{colorTextStatusError}"
          },
          "colorBackgroundCodeEditorGutterDefault": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorLoading": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorPaneItemHover": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCodeEditorStatusBar": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundContainerContent": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundContainerHeader": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlChecked": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundControlDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlDisabled": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundDropdownItemDimmed": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundDropdownItemFilterMatch": {
            "light": "{colorBlue100}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemHover": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey850}"
          },
          "colorBackgroundDropdownItemSelected": {
            "light": "{colorBackgroundItemSelected}",
            "dark": "{colorBackgroundItemSelected}"
          },
          "colorBackgroundHomeHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundInputDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundItemSelected": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundLayoutMain": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundLayoutMobilePanel": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutPanelContent": {
            "light": "{colorBackgroundContainerContent}",
            "dark": "{colorBackgroundContainerContent}"
          },
          "colorBackgroundLayoutPanelHover": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundLayoutToggleActive": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundLayoutToggleSelectedActive": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedHover": {
            "light": "{colorBlue700}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundModalOverlay": {
            "light": "{colorGreyOpaque70}",
            "dark": "{colorGreyOpaque70}"
          },
          "colorBackgroundNotificationBlue": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorBackgroundNotificationGreen": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen600}"
          },
          "colorBackgroundNotificationGrey": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundNotificationRed": {
            "light": "{colorRed600}",
            "dark": "{colorRed600}"
          },
          "colorBackgroundNotificationYellow": {
            "light": "{colorYellow600}",
            "dark": "{colorYellow600}"
          },
          "colorBackgroundNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarActive": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundPopover": {
            "light": "{colorWhite}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundProgressBarContentDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundProgressBarContentInFlash": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundProgressBarLayoutDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundProgressBarLayoutInFlash": {
            "light": "{colorGreyOpaque10}",
            "dark": "{colorGreyOpaque10}"
          },
          "colorBackgroundSegmentActive": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSegmentDefault": {
            "light": "{colorBackgroundButtonNormalDefault}",
            "dark": "{colorBackgroundButtonNormalDefault}"
          },
          "colorBackgroundSegmentDisabled": {
            "light": "{colorBackgroundButtonNormalDisabled}",
            "dark": "{colorBackgroundButtonNormalDisabled}"
          },
          "colorBackgroundSegmentHover": {
            "light": "{colorBackgroundSegmentDefault}",
            "dark": "{colorBackgroundSegmentDefault}"
          },
          "colorBackgroundSliderHandleDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSliderHandleActive": {
            "light": "{colorBlue700}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundSliderTrack": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundSliderHandleRing": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundSliderErrorPressed": {
            "light": "{colorRed700}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundSliderWarningPressed": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorBackgroundStatusError": {
            "light": "{colorRed100}",
            "dark": "{colorRed900}"
          },
          "colorBackgroundStatusInfo": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundStatusSuccess": {
            "light": "{colorGreen100}",
            "dark": "{colorGreen900}"
          },
          "colorBackgroundStatusWarning": {
            "light": "{colorYellow100}",
            "dark": "{colorYellow900}"
          },
          "colorBackgroundTableHeader": {
            "light": "{colorBackgroundContainerHeader}",
            "dark": "{colorBackgroundContainerHeader}"
          },
          "colorBackgroundTilesDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleCheckedDisabled": {
            "light": "{colorBlue300}",
            "dark": "{colorBlue800}"
          },
          "colorBackgroundToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundAvatarGenAi": {
            "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
            "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
          },
          "colorBackgroundAvatarDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextAvatar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundLoadingBarGenAi": {
            "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
            "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
          },
          "colorBackgroundChatBubbleOutgoing": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundChatBubbleIncoming": {
            "light": "{colorGrey125}",
            "dark": "{colorGrey900}"
          },
          "colorTextChatBubbleOutgoing": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorTextChatBubbleIncoming": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorBorderButtonNormalActive": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorBorderButtonNormalDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorBorderToggleButtonNormalPressed": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderButtonNormalDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextButtonNormalDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderButtonNormalHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorBorderButtonPrimaryDisabled": {
            "light": "{colorBackgroundButtonPrimaryDisabled}",
            "dark": "{colorBackgroundButtonPrimaryDisabled}"
          },
          "colorTextButtonPrimaryDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderCalendarGrid": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderCalendarGridSelectedFocusRing": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey800}"
          },
          "colorBorderCodeEditorAceActiveLineLightTheme": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderCodeEditorAceActiveLineDarkTheme": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorPaneItemHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderContainerDivider": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderContainerTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderControlChecked": {
            "light": "{colorBackgroundControlChecked}",
            "dark": "{colorBackgroundControlChecked}"
          },
          "colorBorderControlDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderControlDisabled": {
            "light": "{colorBackgroundControlDisabled}",
            "dark": "{colorBackgroundControlDisabled}"
          },
          "colorBorderDividerActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerDefault": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorBorderDividerPanelBottom": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerPanelSide": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerSecondary": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey700}"
          },
          "colorBorderDropdownContainer": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownGroup": {
            "light": "{colorBorderDropdownItemDefault}",
            "dark": "{colorBorderDropdownItemDefault}"
          },
          "colorBorderDropdownItemDefault": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDropdownItemHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownItemDimmedHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderDropdownItemSelected": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderDropdownItemTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderEditableCellHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderInputDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBorderInputDisabled": {
            "light": "{colorBackgroundInputDisabled}",
            "dark": "{colorBackgroundInputDisabled}"
          },
          "colorBorderInputFocused": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue300}"
          },
          "colorBorderItemFocused": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorBorderDropdownItemFocused": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorBorderItemPlaceholder": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderItemSelected": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderLayout": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey600}"
          },
          "colorBorderNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderPanelHeader": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderPopover": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorBorderSegmentActive": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorBorderSegmentDisabled": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentHover": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderStatusError": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorBorderStatusInfo": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderStatusSuccess": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen500}"
          },
          "colorBorderStatusWarning": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorBorderDividerInteractiveDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey300}"
          },
          "colorBorderTabsDivider": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey600}"
          },
          "colorBorderTabsShadow": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorBorderTabsUnderline": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorBorderTilesDisabled": {
            "light": "{colorBackgroundTilesDisabled}",
            "dark": "{colorBackgroundTilesDisabled}"
          },
          "colorBorderTutorial": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey600}"
          },
          "colorForegroundControlDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorForegroundControlDisabled": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorForegroundControlReadOnly": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorShadowDefault": {
            "light": "{colorGreyTransparentHeavy}",
            "dark": "{colorGreyTransparentHeavy}"
          },
          "colorShadowMedium": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorShadowSide": {
            "light": "{colorGreyTransparentLight}",
            "dark": "{colorGreyTransparentLight}"
          },
          "colorStrokeChartLine": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorStrokeCodeEditorResizeHandler": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorStrokeCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey750}"
          },
          "colorStrokeCodeEditorGutterActiveLineHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey900}"
          },
          "colorTextAccent": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextBodyDefault": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorTextBodySecondary": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorTextBreadcrumbCurrent": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey500}"
          },
          "colorTextBreadcrumbIcon": {
            "light": "{colorGrey500}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextButtonInlineIconDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextButtonNormalActive": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextToggleButtonNormalPressed": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "colorTextButtonNormalDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextButtonNormalHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkButtonNormalDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextLinkButtonNormalHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextLinkButtonNormalActive": {
            "light": "{colorTextButtonNormalActive}",
            "dark": "{colorTextButtonNormalActive}"
          },
          "colorTextButtonPrimaryActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryHover": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextCalendarDateHover": {
            "light": "{colorTextDropdownItemDefault}",
            "dark": "{colorTextDropdownItemDefault}"
          },
          "colorTextCalendarDateSelected": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextCalendarMonth": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextCodeEditorGutterActiveLine": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextCodeEditorGutterDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextCodeEditorStatusBarDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorTextCodeEditorTabButtonError": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextColumnHeader": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey400}"
          },
          "colorTextColumnSortingIcon": {
            "light": "{colorTextColumnHeader}",
            "dark": "{colorTextColumnHeader}"
          },
          "colorTextControlDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextCounter": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextDisabledInlineEdit": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey400}"
          },
          "colorTextDropdownFooter": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownGroupLabel": {
            "light": "{colorTextGroupLabel}",
            "dark": "{colorTextGroupLabel}"
          },
          "colorTextDropdownItemDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextDropdownItemDimmed": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemFilterMatch": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue400}"
          },
          "colorTextDropdownItemHighlighted": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey200}"
          },
          "colorTextDropdownItemSecondary": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownItemSecondaryHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey300}"
          },
          "colorTextEmpty": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionDefault": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorTextExpandableSectionHover": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorTextExpandableSectionNavigationIconDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorTextInteractiveDefault}"
          },
          "colorTextFormDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextFormLabel": {
            "light": "{colorTextFormDefault}",
            "dark": "{colorTextFormDefault}"
          },
          "colorTextFormSecondary": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextGroupLabel": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorTextLabelGenAi": {
            "light": "{colorPurple600}",
            "dark": "{colorPurple400}"
          },
          "colorTextHeadingDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey200}"
          },
          "colorTextHeadingSecondary": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorTextHomeHeaderDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHomeHeaderSecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextIconCaret": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey450}"
          },
          "colorTextIconSubtle": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey400}"
          },
          "colorTextInputDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextInputPlaceholder": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextInputPlaceholderDisabled": {
            "light": "{colorTextInputDisabled}",
            "dark": "{colorTextInputDisabled}"
          },
          "colorTextInteractiveActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextInteractiveHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextToggleButtonIconPressed": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveInvertedDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextInteractiveInvertedHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextInverted": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextLabel": {
            "light": "{colorTextFormLabel}",
            "dark": "{colorTextFormLabel}"
          },
          "colorTextLayoutToggle": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLayoutToggleActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorTextLayoutToggleHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextLayoutToggleSelected": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextLinkHover": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkInvertedHover": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorTextLinkButtonUnderline": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextLinkButtonUnderlineHover": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextNotificationDefault": {
            "light": "{colorTextNotificationYellow}",
            "dark": "{colorTextNotificationYellow}"
          },
          "colorTextNotificationStackBar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextNotificationYellow": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextPaginationPageNumberActiveDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextPaginationPageNumberDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorGrey400}"
          },
          "colorTextSegmentActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextSegmentDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextSegmentHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextSmall": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusError": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorTextStatusInactive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusInfo": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextStatusSuccess": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen500}"
          },
          "colorTextStatusWarning": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorTextTopNavigationTitle": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorBoardPlaceholderActive": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey550}"
          },
          "colorBoardPlaceholderHover": {
            "light": "{colorBlue200}",
            "dark": "{colorBlue600}"
          },
          "colorDragPlaceholderActive": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey550}"
          },
          "colorDragPlaceholderHover": {
            "light": "{colorBlue200}",
            "dark": "{colorBlue600}"
          },
          "colorDropzoneBackgroundDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorDropzoneBackgroundHover": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorDropzoneTextDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneTextHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneBorderDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorDropzoneBorderHover": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          }
        }
      },
      "alert": {
        "id": "alert",
        "selector": ".awsui-context-alert",
        "tokens": {
          "colorGreyOpaque10": {
            "light": "rgba(0, 0, 0, 0.1)",
            "dark": "rgba(0, 0, 0, 0.1)"
          },
          "colorGreyOpaque25": {
            "light": "rgba(255, 255, 255, 0.25)",
            "dark": "rgba(255, 255, 255, 0.25)"
          },
          "colorGreyOpaque40": {
            "light": "rgba(0, 0, 0, 0.4)",
            "dark": "rgba(0, 0, 0, 0.4)"
          },
          "colorGreyOpaque50": {
            "light": "rgba(0, 0, 0, 0.5)",
            "dark": "rgba(0, 0, 0, 0.5)"
          },
          "colorGreyOpaque70": {
            "light": "rgba(35, 43, 55, 0.7)",
            "dark": "rgba(15, 20, 26, 0.7)"
          },
          "colorGreyOpaque80": {
            "light": "rgba(22, 25, 31, 0.8)",
            "dark": "rgba(22, 25, 31, 0.8)"
          },
          "colorGreyOpaque90": {
            "light": "rgba(242, 243, 243, 0.9)",
            "dark": "rgba(242, 243, 243, 0.9)"
          },
          "colorGreyTransparent": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentHeavy": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentLight": {
            "light": "rgba(15, 20, 26, 0.12)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorBackgroundBadgeIcon": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundButtonLinkActive": {
            "light": "{colorBlue200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonLinkHover": {
            "light": "{colorBlue100}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundButtonNormalActive": {
            "light": "rgba(0, 7, 22, 0.1)",
            "dark": "rgba(255, 255, 255, 0.15)"
          },
          "colorBackgroundButtonNormalDefault": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundButtonNormalDisabled": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundButtonNormalHover": {
            "light": "rgba(0, 7, 22, 0.05)",
            "dark": "rgba(255, 255, 255, 0.1)"
          },
          "colorBackgroundToggleButtonNormalPressed": {
            "light": "{colorBlue200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonPrimaryActive": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundButtonPrimaryDefault": {
            "light": "{colorBorderButtonNormalDefault}",
            "dark": "{colorBorderButtonNormalDefault}"
          },
          "colorBackgroundButtonPrimaryDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundButtonPrimaryHover": {
            "light": "{colorBorderButtonNormalHover}",
            "dark": "{colorBorderButtonNormalHover}"
          },
          "colorBackgroundCalendarCurrentDate": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCellShaded": {
            "light": "{colorGrey125}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundCodeEditorGutterActiveLineError": {
            "light": "{colorTextStatusError}",
            "dark": "{colorTextStatusError}"
          },
          "colorBackgroundCodeEditorGutterDefault": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorLoading": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorPaneItemHover": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCodeEditorStatusBar": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundContainerContent": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundContainerHeader": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlChecked": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundControlDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlDisabled": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundDropdownItemDimmed": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundDropdownItemFilterMatch": {
            "light": "{colorBlue100}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemHover": {
            "light": "{colorGrey150}",
            "dark": "{colorGrey850}"
          },
          "colorBackgroundDropdownItemSelected": {
            "light": "{colorBackgroundItemSelected}",
            "dark": "{colorBackgroundItemSelected}"
          },
          "colorBackgroundHomeHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundInputDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundItemSelected": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundLayoutMain": {
            "light": "black",
            "dark": "black"
          },
          "colorBackgroundLayoutMobilePanel": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutPanelContent": {
            "light": "{colorBackgroundContainerContent}",
            "dark": "{colorBackgroundContainerContent}"
          },
          "colorBackgroundLayoutPanelHover": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundLayoutToggleActive": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundLayoutToggleSelectedActive": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedHover": {
            "light": "{colorBlue700}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundModalOverlay": {
            "light": "{colorGreyOpaque70}",
            "dark": "{colorGreyOpaque70}"
          },
          "colorBackgroundNotificationBlue": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorBackgroundNotificationGreen": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen600}"
          },
          "colorBackgroundNotificationGrey": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundNotificationRed": {
            "light": "{colorRed600}",
            "dark": "{colorRed600}"
          },
          "colorBackgroundNotificationYellow": {
            "light": "{colorYellow600}",
            "dark": "{colorYellow600}"
          },
          "colorBackgroundNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarActive": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundPopover": {
            "light": "{colorWhite}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundProgressBarContentDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundProgressBarContentInFlash": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundProgressBarLayoutDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundProgressBarLayoutInFlash": {
            "light": "{colorGreyOpaque25}",
            "dark": "{colorGreyOpaque25}"
          },
          "colorBackgroundSegmentActive": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSegmentDefault": {
            "light": "{colorBackgroundButtonNormalDefault}",
            "dark": "{colorBackgroundButtonNormalDefault}"
          },
          "colorBackgroundSegmentDisabled": {
            "light": "{colorBackgroundButtonNormalDisabled}",
            "dark": "{colorBackgroundButtonNormalDisabled}"
          },
          "colorBackgroundSegmentHover": {
            "light": "{colorBackgroundSegmentDefault}",
            "dark": "{colorBackgroundSegmentDefault}"
          },
          "colorBackgroundSliderHandleDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSliderHandleActive": {
            "light": "{colorBlue700}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundSliderTrack": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundSliderHandleRing": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundSliderErrorPressed": {
            "light": "{colorRed700}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundSliderWarningPressed": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorBackgroundStatusError": {
            "light": "{colorRed100}",
            "dark": "{colorRed900}"
          },
          "colorBackgroundStatusInfo": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundStatusSuccess": {
            "light": "{colorGreen100}",
            "dark": "{colorGreen900}"
          },
          "colorBackgroundStatusWarning": {
            "light": "{colorYellow100}",
            "dark": "{colorYellow900}"
          },
          "colorBackgroundTableHeader": {
            "light": "{colorBackgroundContainerHeader}",
            "dark": "{colorBackgroundContainerHeader}"
          },
          "colorBackgroundTilesDisabled": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleCheckedDisabled": {
            "light": "{colorBlue300}",
            "dark": "{colorBlue800}"
          },
          "colorBackgroundToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundAvatarGenAi": {
            "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
            "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
          },
          "colorBackgroundAvatarDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextAvatar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundLoadingBarGenAi": {
            "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
            "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
          },
          "colorBackgroundChatBubbleOutgoing": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundChatBubbleIncoming": {
            "light": "{colorGrey125}",
            "dark": "{colorGrey900}"
          },
          "colorTextChatBubbleOutgoing": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorTextChatBubbleIncoming": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorBorderButtonNormalActive": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorBorderButtonNormalDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorBorderToggleButtonNormalPressed": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderButtonNormalDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextButtonNormalDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderButtonNormalHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorBorderButtonPrimaryDisabled": {
            "light": "{colorBackgroundButtonPrimaryDisabled}",
            "dark": "{colorBackgroundButtonPrimaryDisabled}"
          },
          "colorTextButtonPrimaryDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderCalendarGrid": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderCalendarGridSelectedFocusRing": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey800}"
          },
          "colorBorderCodeEditorAceActiveLineLightTheme": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderCodeEditorAceActiveLineDarkTheme": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorPaneItemHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderContainerDivider": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderContainerTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderControlChecked": {
            "light": "{colorBackgroundControlChecked}",
            "dark": "{colorBackgroundControlChecked}"
          },
          "colorBorderControlDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderControlDisabled": {
            "light": "{colorBackgroundControlDisabled}",
            "dark": "{colorBackgroundControlDisabled}"
          },
          "colorBorderDividerActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorBorderDividerPanelBottom": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerPanelSide": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerSecondary": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey700}"
          },
          "colorBorderDropdownContainer": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownGroup": {
            "light": "{colorBorderDropdownItemDefault}",
            "dark": "{colorBorderDropdownItemDefault}"
          },
          "colorBorderDropdownItemDefault": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDropdownItemHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownItemDimmedHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderDropdownItemSelected": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderDropdownItemTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderEditableCellHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderInputDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorBorderInputDisabled": {
            "light": "{colorBackgroundInputDisabled}",
            "dark": "{colorBackgroundInputDisabled}"
          },
          "colorBorderInputFocused": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue300}"
          },
          "colorBorderItemFocused": {
            "light": "{colorBlue600}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDropdownItemFocused": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorBorderItemPlaceholder": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderItemSelected": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderLayout": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey600}"
          },
          "colorBorderNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderPanelHeader": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderPopover": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorBorderSegmentActive": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorBorderSegmentDisabled": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentHover": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderStatusError": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorBorderStatusInfo": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorBorderStatusSuccess": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen500}"
          },
          "colorBorderStatusWarning": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorBorderDividerInteractiveDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey300}"
          },
          "colorBorderTabsDivider": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey600}"
          },
          "colorBorderTabsShadow": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorBorderTabsUnderline": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorBorderTilesDisabled": {
            "light": "{colorBackgroundTilesDisabled}",
            "dark": "{colorBackgroundTilesDisabled}"
          },
          "colorBorderTutorial": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey600}"
          },
          "colorForegroundControlDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorForegroundControlDisabled": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorForegroundControlReadOnly": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorShadowDefault": {
            "light": "{colorGreyTransparentHeavy}",
            "dark": "{colorGreyTransparentHeavy}"
          },
          "colorShadowMedium": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorShadowSide": {
            "light": "{colorGreyTransparentLight}",
            "dark": "{colorGreyTransparentLight}"
          },
          "colorStrokeChartLine": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorStrokeCodeEditorResizeHandler": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorStrokeCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey750}"
          },
          "colorStrokeCodeEditorGutterActiveLineHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey900}"
          },
          "colorTextAccent": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextBodyDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey350}"
          },
          "colorTextBodySecondary": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorTextBreadcrumbCurrent": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey500}"
          },
          "colorTextBreadcrumbIcon": {
            "light": "{colorGrey500}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextButtonInlineIconDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextButtonNormalActive": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextToggleButtonNormalPressed": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "colorTextButtonNormalDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextButtonNormalHover": {
            "light": "{colorGrey900}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonNormalDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextLinkButtonNormalHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextLinkButtonNormalActive": {
            "light": "{colorTextButtonNormalActive}",
            "dark": "{colorTextButtonNormalActive}"
          },
          "colorTextButtonPrimaryActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryHover": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextCalendarDateHover": {
            "light": "{colorTextDropdownItemDefault}",
            "dark": "{colorTextDropdownItemDefault}"
          },
          "colorTextCalendarDateSelected": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextCalendarMonth": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextCodeEditorGutterActiveLine": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextCodeEditorGutterDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextCodeEditorStatusBarDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorTextCodeEditorTabButtonError": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextColumnHeader": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey400}"
          },
          "colorTextColumnSortingIcon": {
            "light": "{colorTextColumnHeader}",
            "dark": "{colorTextColumnHeader}"
          },
          "colorTextControlDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextCounter": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextDisabledInlineEdit": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey400}"
          },
          "colorTextDropdownFooter": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownGroupLabel": {
            "light": "{colorTextGroupLabel}",
            "dark": "{colorTextGroupLabel}"
          },
          "colorTextDropdownItemDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextDropdownItemDimmed": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemFilterMatch": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue400}"
          },
          "colorTextDropdownItemHighlighted": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey200}"
          },
          "colorTextDropdownItemSecondary": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownItemSecondaryHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey300}"
          },
          "colorTextEmpty": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorTextExpandableSectionHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextExpandableSectionNavigationIconDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorTextInteractiveDefault}"
          },
          "colorTextFormDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey300}"
          },
          "colorTextFormLabel": {
            "light": "{colorTextFormDefault}",
            "dark": "{colorTextFormDefault}"
          },
          "colorTextFormSecondary": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextGroupLabel": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorTextLabelGenAi": {
            "light": "{colorPurple600}",
            "dark": "{colorPurple400}"
          },
          "colorTextHeadingDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey200}"
          },
          "colorTextHeadingSecondary": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey450}"
          },
          "colorTextHomeHeaderDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHomeHeaderSecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextIconCaret": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey450}"
          },
          "colorTextIconSubtle": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey400}"
          },
          "colorTextInputDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextInputPlaceholder": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextInputPlaceholderDisabled": {
            "light": "{colorTextInputDisabled}",
            "dark": "{colorTextInputDisabled}"
          },
          "colorTextInteractiveActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveDisabled": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey550}"
          },
          "colorTextInteractiveHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextToggleButtonIconPressed": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveInvertedDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveInvertedHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInverted": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextLabel": {
            "light": "{colorTextFormLabel}",
            "dark": "{colorTextFormLabel}"
          },
          "colorTextLayoutToggle": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLayoutToggleActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorTextLayoutToggleHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextLayoutToggleSelected": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkDefault": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextLinkHover": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkInvertedHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonUnderline": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextLinkButtonUnderlineHover": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextNotificationDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextNotificationStackBar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextNotificationYellow": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextPaginationPageNumberActiveDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextPaginationPageNumberDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorGrey400}"
          },
          "colorTextSegmentActive": {
            "light": "{colorWhite}",
            "dark": "{colorGrey900}"
          },
          "colorTextSegmentDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey300}"
          },
          "colorTextSegmentHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextSmall": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusError": {
            "light": "{colorRed600}",
            "dark": "{colorRed500}"
          },
          "colorTextStatusInactive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusInfo": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue500}"
          },
          "colorTextStatusSuccess": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen500}"
          },
          "colorTextStatusWarning": {
            "light": "{colorYellow800}",
            "dark": "{colorYellow700}"
          },
          "colorTextTopNavigationTitle": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey100}"
          },
          "colorBoardPlaceholderActive": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey550}"
          },
          "colorBoardPlaceholderHover": {
            "light": "{colorBlue200}",
            "dark": "{colorBlue600}"
          },
          "colorDragPlaceholderActive": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey550}"
          },
          "colorDragPlaceholderHover": {
            "light": "{colorBlue200}",
            "dark": "{colorBlue600}"
          },
          "colorDropzoneBackgroundDefault": {
            "light": "{colorWhite}",
            "dark": "{colorGrey800}"
          },
          "colorDropzoneBackgroundHover": {
            "light": "{colorBlue100}",
            "dark": "{colorBlue900}"
          },
          "colorDropzoneTextDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneTextHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneBorderDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey550}"
          },
          "colorDropzoneBorderHover": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue400}"
          },
          "fontExpandableHeadingSize": "14px",
          "borderDividerSectionWidth": "1px"
        }
      },
      "alert-header": {
        "id": "alert-header",
        "selector": ".awsui-context-content-header .awsui-context-alert",
        "tokens": {
          "colorGreyOpaque10": {
            "light": "rgba(0, 0, 0, 0.1)",
            "dark": "rgba(0, 0, 0, 0.1)"
          },
          "colorGreyOpaque25": {
            "light": "rgba(255, 255, 255, 0.25)",
            "dark": "rgba(255, 255, 255, 0.25)"
          },
          "colorGreyOpaque40": {
            "light": "rgba(0, 0, 0, 0.4)",
            "dark": "rgba(0, 0, 0, 0.4)"
          },
          "colorGreyOpaque50": {
            "light": "rgba(0, 0, 0, 0.5)",
            "dark": "rgba(0, 0, 0, 0.5)"
          },
          "colorGreyOpaque70": {
            "light": "rgba(15, 20, 26, 0.7)",
            "dark": "rgba(15, 20, 26, 0.7)"
          },
          "colorGreyOpaque80": {
            "light": "rgba(22, 25, 31, 0.8)",
            "dark": "rgba(22, 25, 31, 0.8)"
          },
          "colorGreyOpaque90": {
            "light": "rgba(242, 243, 243, 0.9)",
            "dark": "rgba(242, 243, 243, 0.9)"
          },
          "colorGreyTransparent": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentHeavy": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorGreyTransparentLight": {
            "light": "rgba(15, 20, 26, 1)",
            "dark": "rgba(15, 20, 26, 1)"
          },
          "colorBackgroundBadgeIcon": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundButtonLinkActive": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonLinkHover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundButtonNormalActive": {
            "light": "rgba(255, 255, 255, 0.15)",
            "dark": "rgba(255, 255, 255, 0.15)"
          },
          "colorBackgroundButtonNormalDefault": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundButtonNormalDisabled": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundButtonNormalHover": {
            "light": "rgba(255, 255, 255, 0.1)",
            "dark": "rgba(255, 255, 255, 0.1)"
          },
          "colorBackgroundToggleButtonNormalPressed": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundButtonPrimaryActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundButtonPrimaryDefault": {
            "light": "{colorBorderButtonNormalDefault}",
            "dark": "{colorBorderButtonNormalDefault}"
          },
          "colorBackgroundButtonPrimaryDisabled": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundButtonPrimaryHover": {
            "light": "{colorBorderButtonNormalHover}",
            "dark": "{colorBorderButtonNormalHover}"
          },
          "colorBackgroundCalendarCurrentDate": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCellShaded": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundCodeEditorGutterActiveLineError": {
            "light": "{colorTextStatusError}",
            "dark": "{colorTextStatusError}"
          },
          "colorBackgroundCodeEditorGutterDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorLoading": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundCodeEditorPaneItemHover": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundCodeEditorStatusBar": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundContainerContent": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundContainerHeader": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlChecked": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundControlDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundControlDisabled": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundDropdownItemDimmed": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundDropdownItemFilterMatch": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundDropdownItemHover": {
            "light": "{colorGrey850}",
            "dark": "{colorGrey850}"
          },
          "colorBackgroundDropdownItemSelected": {
            "light": "{colorBackgroundItemSelected}",
            "dark": "{colorBackgroundItemSelected}"
          },
          "colorBackgroundHomeHeader": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundInputDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundInputDisabled": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundItemSelected": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundLayoutMain": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundLayoutMobilePanel": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorBackgroundLayoutPanelContent": {
            "light": "{colorBackgroundContainerContent}",
            "dark": "{colorBackgroundContainerContent}"
          },
          "colorBackgroundLayoutPanelHover": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundLayoutToggleActive": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundLayoutToggleHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundLayoutToggleSelectedActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundLayoutToggleSelectedHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundModalOverlay": {
            "light": "{colorGreyOpaque70}",
            "dark": "{colorGreyOpaque70}"
          },
          "colorBackgroundNotificationBlue": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorBackgroundNotificationGreen": {
            "light": "{colorGreen600}",
            "dark": "{colorGreen600}"
          },
          "colorBackgroundNotificationGrey": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundNotificationRed": {
            "light": "{colorRed600}",
            "dark": "{colorRed600}"
          },
          "colorBackgroundNotificationYellow": {
            "light": "{colorYellow600}",
            "dark": "{colorYellow600}"
          },
          "colorBackgroundNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarActive": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBackgroundNotificationStackBarHover": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBackgroundPopover": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundProgressBarContentDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundProgressBarContentInFlash": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundProgressBarLayoutDefault": {
            "light": "{colorGrey650}",
            "dark": "{colorGrey650}"
          },
          "colorBackgroundProgressBarLayoutInFlash": {
            "light": "{colorGreyOpaque25}",
            "dark": "{colorGreyOpaque25}"
          },
          "colorBackgroundSegmentActive": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSegmentDefault": {
            "light": "{colorBackgroundButtonNormalDefault}",
            "dark": "{colorBackgroundButtonNormalDefault}"
          },
          "colorBackgroundSegmentDisabled": {
            "light": "{colorBackgroundButtonNormalDisabled}",
            "dark": "{colorBackgroundButtonNormalDisabled}"
          },
          "colorBackgroundSegmentHover": {
            "light": "{colorBackgroundSegmentDefault}",
            "dark": "{colorBackgroundSegmentDefault}"
          },
          "colorBackgroundSliderHandleDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBackgroundSliderHandleActive": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorBackgroundSliderTrack": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBackgroundSliderHandleRing": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBackgroundSliderErrorPressed": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBackgroundSliderWarningPressed": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorBackgroundStatusError": {
            "light": "{colorRed900}",
            "dark": "{colorRed900}"
          },
          "colorBackgroundStatusInfo": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorBackgroundStatusSuccess": {
            "light": "{colorGreen900}",
            "dark": "{colorGreen900}"
          },
          "colorBackgroundStatusWarning": {
            "light": "{colorYellow900}",
            "dark": "{colorYellow900}"
          },
          "colorBackgroundTableHeader": {
            "light": "{colorBackgroundContainerHeader}",
            "dark": "{colorBackgroundContainerHeader}"
          },
          "colorBackgroundTilesDisabled": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorBackgroundToggleCheckedDisabled": {
            "light": "{colorBlue800}",
            "dark": "{colorBlue800}"
          },
          "colorBackgroundToggleDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBackgroundAvatarGenAi": {
            "light": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)",
            "dark": "radial-gradient(circle farthest-corner at top left,rgba(0, 150, 250, 1) -25%,rgba(0, 150, 250, 0) 55%),radial-gradient(circle farthest-corner at top right, rgba(216, 178, 255, 1) -10%, rgba(115, 0, 229, 1) 50%)"
          },
          "colorBackgroundAvatarDefault": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorTextAvatar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorBackgroundLoadingBarGenAi": {
            "light": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)",
            "dark": "linear-gradient(90deg, #99f7ff 0%, #0096fa 10%, #bf80ff 24%, #7300e5 50%, #bf80ff 76%, #0096fa 90%, #99f7ff 100%)"
          },
          "colorBackgroundChatBubbleOutgoing": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBackgroundChatBubbleIncoming": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextChatBubbleOutgoing": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorTextChatBubbleIncoming": {
            "light": "{colorTextBodyDefault}",
            "dark": "{colorTextBodyDefault}"
          },
          "colorBorderButtonNormalActive": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorBorderButtonNormalDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorBorderToggleButtonNormalPressed": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderButtonNormalDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextButtonNormalDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderButtonNormalHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorBorderButtonPrimaryDisabled": {
            "light": "{colorBackgroundButtonPrimaryDisabled}",
            "dark": "{colorBackgroundButtonPrimaryDisabled}"
          },
          "colorTextButtonPrimaryDisabled": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderCalendarGrid": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderCalendarGridSelectedFocusRing": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorBorderCodeEditorAceActiveLineLightTheme": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderCodeEditorAceActiveLineDarkTheme": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderCodeEditorPaneItemHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderContainerDivider": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderContainerTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderControlChecked": {
            "light": "{colorBackgroundControlChecked}",
            "dark": "{colorBackgroundControlChecked}"
          },
          "colorBorderControlDefault": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderControlDisabled": {
            "light": "{colorBackgroundControlDisabled}",
            "dark": "{colorBackgroundControlDisabled}"
          },
          "colorBorderDividerActive": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDividerDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorBorderDividerPanelBottom": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerPanelSide": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDividerSecondary": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderDropdownContainer": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownGroup": {
            "light": "{colorBorderDropdownItemDefault}",
            "dark": "{colorBorderDropdownItemDefault}"
          },
          "colorBorderDropdownItemDefault": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderDropdownItemHover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderDropdownItemDimmedHover": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorBorderDropdownItemSelected": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderDropdownItemTop": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorBorderEditableCellHover": {
            "light": "{colorBorderDropdownItemHover}",
            "dark": "{colorBorderDropdownItemHover}"
          },
          "colorBorderInputDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderInputDisabled": {
            "light": "{colorBackgroundInputDisabled}",
            "dark": "{colorBackgroundInputDisabled}"
          },
          "colorBorderInputFocused": {
            "light": "{colorBlue300}",
            "dark": "{colorBlue300}"
          },
          "colorBorderItemFocused": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBorderDropdownItemFocused": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderItemPlaceholder": {
            "light": "{colorBorderItemSelected}",
            "dark": "{colorBorderItemSelected}"
          },
          "colorBorderItemSelected": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderLayout": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderNotificationStackBar": {
            "light": "{colorGrey700}",
            "dark": "{colorGrey700}"
          },
          "colorBorderPanelHeader": {
            "light": "{colorBorderDividerDefault}",
            "dark": "{colorBorderDividerDefault}"
          },
          "colorBorderPopover": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBorderSegmentActive": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderSegmentDisabled": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderSegmentHover": {
            "light": "{colorBorderSegmentDefault}",
            "dark": "{colorBorderSegmentDefault}"
          },
          "colorBorderStatusError": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorBorderStatusInfo": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorBorderStatusSuccess": {
            "light": "{colorGreen500}",
            "dark": "{colorGreen500}"
          },
          "colorBorderStatusWarning": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorBorderDividerInteractiveDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorBorderTabsDivider": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorBorderTabsShadow": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorBorderTabsUnderline": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorBorderTilesDisabled": {
            "light": "{colorBackgroundTilesDisabled}",
            "dark": "{colorBackgroundTilesDisabled}"
          },
          "colorBorderTutorial": {
            "light": "{colorGrey600}",
            "dark": "{colorGrey600}"
          },
          "colorForegroundControlDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorForegroundControlDisabled": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorForegroundControlReadOnly": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorShadowDefault": {
            "light": "{colorGreyTransparentHeavy}",
            "dark": "{colorGreyTransparentHeavy}"
          },
          "colorShadowMedium": {
            "light": "{colorGreyTransparent}",
            "dark": "{colorGreyTransparent}"
          },
          "colorShadowSide": {
            "light": "{colorGreyTransparentLight}",
            "dark": "{colorGreyTransparentLight}"
          },
          "colorStrokeChartLine": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorStrokeCodeEditorResizeHandler": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorStrokeCodeEditorGutterActiveLineDefault": {
            "light": "{colorGrey750}",
            "dark": "{colorGrey750}"
          },
          "colorStrokeCodeEditorGutterActiveLineHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextAccent": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextBodyDefault": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextBodySecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextBreadcrumbCurrent": {
            "light": "{colorGrey500}",
            "dark": "{colorGrey500}"
          },
          "colorTextBreadcrumbIcon": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextButtonInlineIconDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextButtonInlineIconHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextButtonNormalActive": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextToggleButtonNormalPressed": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextButtonNormalDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextButtonNormalHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonNormalDefault": {
            "light": "{colorTextLinkDefault}",
            "dark": "{colorTextLinkDefault}"
          },
          "colorTextLinkButtonNormalHover": {
            "light": "{colorTextLinkHover}",
            "dark": "{colorTextLinkHover}"
          },
          "colorTextLinkButtonNormalActive": {
            "light": "{colorTextButtonNormalActive}",
            "dark": "{colorTextButtonNormalActive}"
          },
          "colorTextButtonPrimaryActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryDefault": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextButtonPrimaryHover": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextCalendarDateHover": {
            "light": "{colorTextDropdownItemDefault}",
            "dark": "{colorTextDropdownItemDefault}"
          },
          "colorTextCalendarDateSelected": {
            "light": "{colorTextAccent}",
            "dark": "{colorTextAccent}"
          },
          "colorTextCalendarMonth": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextCodeEditorGutterActiveLine": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextCodeEditorGutterDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextCodeEditorStatusBarDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextCodeEditorTabButtonError": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextColumnHeader": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextColumnSortingIcon": {
            "light": "{colorTextColumnHeader}",
            "dark": "{colorTextColumnHeader}"
          },
          "colorTextControlDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextCounter": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextDisabledInlineEdit": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextDropdownFooter": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownGroupLabel": {
            "light": "{colorTextGroupLabel}",
            "dark": "{colorTextGroupLabel}"
          },
          "colorTextDropdownItemDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextDropdownItemDimmed": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextDropdownItemFilterMatch": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextDropdownItemHighlighted": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextDropdownItemSecondary": {
            "light": "{colorTextFormSecondary}",
            "dark": "{colorTextFormSecondary}"
          },
          "colorTextDropdownItemSecondaryHover": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextEmpty": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextExpandableSectionDefault": {
            "light": "{colorTextButtonNormalDefault}",
            "dark": "{colorTextButtonNormalDefault}"
          },
          "colorTextExpandableSectionHover": {
            "light": "{colorTextButtonNormalHover}",
            "dark": "{colorTextButtonNormalHover}"
          },
          "colorTextExpandableSectionNavigationIconDefault": {
            "light": "{colorTextInteractiveDefault}",
            "dark": "{colorTextInteractiveDefault}"
          },
          "colorTextFormDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextFormLabel": {
            "light": "{colorTextFormDefault}",
            "dark": "{colorTextFormDefault}"
          },
          "colorTextFormSecondary": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextGroupLabel": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextLabelGenAi": {
            "light": "{colorPurple400}",
            "dark": "{colorPurple400}"
          },
          "colorTextHeadingDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHeadingSecondary": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextHomeHeaderDefault": {
            "light": "{colorGrey200}",
            "dark": "{colorGrey200}"
          },
          "colorTextHomeHeaderSecondary": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorTextIconCaret": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextIconSubtle": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextInputDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextInputPlaceholder": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextInputPlaceholderDisabled": {
            "light": "{colorTextInputDisabled}",
            "dark": "{colorTextInputDisabled}"
          },
          "colorTextInteractiveActive": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveDisabled": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorTextInteractiveHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextToggleButtonIconPressed": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInteractiveInvertedDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextInteractiveInvertedHover": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextInverted": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLabel": {
            "light": "{colorTextFormLabel}",
            "dark": "{colorTextFormLabel}"
          },
          "colorTextLayoutToggle": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLayoutToggleActive": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorTextLayoutToggleHover": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextLayoutToggleSelected": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextLinkDefault": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextLinkHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          },
          "colorTextLinkInvertedHover": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextLinkButtonUnderline": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextLinkButtonUnderlineHover": {
            "light": "transparent",
            "dark": "transparent"
          },
          "colorTextNotificationDefault": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorTextNotificationStackBar": {
            "light": "{colorWhite}",
            "dark": "{colorWhite}"
          },
          "colorTextNotificationYellow": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextPaginationPageNumberActiveDisabled": {
            "light": "{colorTextInteractiveDisabled}",
            "dark": "{colorTextInteractiveDisabled}"
          },
          "colorTextPaginationPageNumberDefault": {
            "light": "{colorGrey400}",
            "dark": "{colorGrey400}"
          },
          "colorTextSegmentActive": {
            "light": "{colorGrey900}",
            "dark": "{colorGrey900}"
          },
          "colorTextSegmentDefault": {
            "light": "{colorGrey300}",
            "dark": "{colorGrey300}"
          },
          "colorTextSegmentHover": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextSmall": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusError": {
            "light": "{colorRed500}",
            "dark": "{colorRed500}"
          },
          "colorTextStatusInactive": {
            "light": "{colorGrey450}",
            "dark": "{colorGrey450}"
          },
          "colorTextStatusInfo": {
            "light": "{colorBlue500}",
            "dark": "{colorBlue500}"
          },
          "colorTextStatusSuccess": {
            "light": "{colorGreen500}",
            "dark": "{colorGreen500}"
          },
          "colorTextStatusWarning": {
            "light": "{colorYellow700}",
            "dark": "{colorYellow700}"
          },
          "colorTextTopNavigationTitle": {
            "light": "{colorGrey100}",
            "dark": "{colorGrey100}"
          },
          "colorBoardPlaceholderActive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorBoardPlaceholderHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorDragPlaceholderActive": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorDragPlaceholderHover": {
            "light": "{colorBlue600}",
            "dark": "{colorBlue600}"
          },
          "colorDropzoneBackgroundDefault": {
            "light": "{colorGrey800}",
            "dark": "{colorGrey800}"
          },
          "colorDropzoneBackgroundHover": {
            "light": "{colorBlue900}",
            "dark": "{colorBlue900}"
          },
          "colorDropzoneTextDefault": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneTextHover": {
            "light": "{colorGrey350}",
            "dark": "{colorGrey350}"
          },
          "colorDropzoneBorderDefault": {
            "light": "{colorGrey550}",
            "dark": "{colorGrey550}"
          },
          "colorDropzoneBorderHover": {
            "light": "{colorBlue400}",
            "dark": "{colorBlue400}"
          }
        }
      }
    },
    "tokenModeMap": {
      "colorChartsRed300": "color",
      "colorChartsRed400": "color",
      "colorChartsRed500": "color",
      "colorChartsRed600": "color",
      "colorChartsRed700": "color",
      "colorChartsRed800": "color",
      "colorChartsRed900": "color",
      "colorChartsRed1000": "color",
      "colorChartsRed1100": "color",
      "colorChartsRed1200": "color",
      "colorChartsOrange300": "color",
      "colorChartsOrange400": "color",
      "colorChartsOrange500": "color",
      "colorChartsOrange600": "color",
      "colorChartsOrange700": "color",
      "colorChartsOrange800": "color",
      "colorChartsOrange900": "color",
      "colorChartsOrange1000": "color",
      "colorChartsOrange1100": "color",
      "colorChartsOrange1200": "color",
      "colorChartsYellow300": "color",
      "colorChartsYellow400": "color",
      "colorChartsYellow500": "color",
      "colorChartsYellow600": "color",
      "colorChartsYellow700": "color",
      "colorChartsYellow800": "color",
      "colorChartsYellow900": "color",
      "colorChartsYellow1000": "color",
      "colorChartsYellow1100": "color",
      "colorChartsYellow1200": "color",
      "colorChartsGreen300": "color",
      "colorChartsGreen400": "color",
      "colorChartsGreen500": "color",
      "colorChartsGreen600": "color",
      "colorChartsGreen700": "color",
      "colorChartsGreen800": "color",
      "colorChartsGreen900": "color",
      "colorChartsGreen1000": "color",
      "colorChartsGreen1100": "color",
      "colorChartsGreen1200": "color",
      "colorChartsTeal300": "color",
      "colorChartsTeal400": "color",
      "colorChartsTeal500": "color",
      "colorChartsTeal600": "color",
      "colorChartsTeal700": "color",
      "colorChartsTeal800": "color",
      "colorChartsTeal900": "color",
      "colorChartsTeal1000": "color",
      "colorChartsTeal1100": "color",
      "colorChartsTeal1200": "color",
      "colorChartsBlue1300": "color",
      "colorChartsBlue1400": "color",
      "colorChartsBlue1500": "color",
      "colorChartsBlue1600": "color",
      "colorChartsBlue1700": "color",
      "colorChartsBlue1800": "color",
      "colorChartsBlue1900": "color",
      "colorChartsBlue11000": "color",
      "colorChartsBlue11100": "color",
      "colorChartsBlue11200": "color",
      "colorChartsBlue2300": "color",
      "colorChartsBlue2400": "color",
      "colorChartsBlue2500": "color",
      "colorChartsBlue2600": "color",
      "colorChartsBlue2700": "color",
      "colorChartsBlue2800": "color",
      "colorChartsBlue2900": "color",
      "colorChartsBlue21000": "color",
      "colorChartsBlue21100": "color",
      "colorChartsBlue21200": "color",
      "colorChartsPurple300": "color",
      "colorChartsPurple400": "color",
      "colorChartsPurple500": "color",
      "colorChartsPurple600": "color",
      "colorChartsPurple700": "color",
      "colorChartsPurple800": "color",
      "colorChartsPurple900": "color",
      "colorChartsPurple1000": "color",
      "colorChartsPurple1100": "color",
      "colorChartsPurple1200": "color",
      "colorChartsPink300": "color",
      "colorChartsPink400": "color",
      "colorChartsPink500": "color",
      "colorChartsPink600": "color",
      "colorChartsPink700": "color",
      "colorChartsPink800": "color",
      "colorChartsPink900": "color",
      "colorChartsPink1000": "color",
      "colorChartsPink1100": "color",
      "colorChartsPink1200": "color",
      "colorChartsStatusCritical": "color",
      "colorChartsStatusHigh": "color",
      "colorChartsStatusMedium": "color",
      "colorChartsStatusLow": "color",
      "colorChartsStatusPositive": "color",
      "colorChartsStatusInfo": "color",
      "colorChartsStatusNeutral": "color",
      "colorChartsThresholdNegative": "color",
      "colorChartsThresholdPositive": "color",
      "colorChartsThresholdInfo": "color",
      "colorChartsThresholdNeutral": "color",
      "colorChartsLineGrid": "color",
      "colorChartsLineTick": "color",
      "colorChartsLineAxis": "color",
      "colorChartsPaletteCategorical1": "color",
      "colorChartsPaletteCategorical2": "color",
      "colorChartsPaletteCategorical3": "color",
      "colorChartsPaletteCategorical4": "color",
      "colorChartsPaletteCategorical5": "color",
      "colorChartsPaletteCategorical6": "color",
      "colorChartsPaletteCategorical7": "color",
      "colorChartsPaletteCategorical8": "color",
      "colorChartsPaletteCategorical9": "color",
      "colorChartsPaletteCategorical10": "color",
      "colorChartsPaletteCategorical11": "color",
      "colorChartsPaletteCategorical12": "color",
      "colorChartsPaletteCategorical13": "color",
      "colorChartsPaletteCategorical14": "color",
      "colorChartsPaletteCategorical15": "color",
      "colorChartsPaletteCategorical16": "color",
      "colorChartsPaletteCategorical17": "color",
      "colorChartsPaletteCategorical18": "color",
      "colorChartsPaletteCategorical19": "color",
      "colorChartsPaletteCategorical20": "color",
      "colorChartsPaletteCategorical21": "color",
      "colorChartsPaletteCategorical22": "color",
      "colorChartsPaletteCategorical23": "color",
      "colorChartsPaletteCategorical24": "color",
      "colorChartsPaletteCategorical25": "color",
      "colorChartsPaletteCategorical26": "color",
      "colorChartsPaletteCategorical27": "color",
      "colorChartsPaletteCategorical28": "color",
      "colorChartsPaletteCategorical29": "color",
      "colorChartsPaletteCategorical30": "color",
      "colorChartsPaletteCategorical31": "color",
      "colorChartsPaletteCategorical32": "color",
      "colorChartsPaletteCategorical33": "color",
      "colorChartsPaletteCategorical34": "color",
      "colorChartsPaletteCategorical35": "color",
      "colorChartsPaletteCategorical36": "color",
      "colorChartsPaletteCategorical37": "color",
      "colorChartsPaletteCategorical38": "color",
      "colorChartsPaletteCategorical39": "color",
      "colorChartsPaletteCategorical40": "color",
      "colorChartsPaletteCategorical41": "color",
      "colorChartsPaletteCategorical42": "color",
      "colorChartsPaletteCategorical43": "color",
      "colorChartsPaletteCategorical44": "color",
      "colorChartsPaletteCategorical45": "color",
      "colorChartsPaletteCategorical46": "color",
      "colorChartsPaletteCategorical47": "color",
      "colorChartsPaletteCategorical48": "color",
      "colorChartsPaletteCategorical49": "color",
      "colorChartsPaletteCategorical50": "color",
      "colorSeverityDarkRed": "color",
      "colorSeverityRed": "color",
      "colorSeverityOrange": "color",
      "colorSeverityYellow": "color",
      "colorSeverityGrey": "color",
      "colorBackgroundNotificationSeverityCritical": "color",
      "colorBackgroundNotificationSeverityHigh": "color",
      "colorBackgroundNotificationSeverityMedium": "color",
      "colorBackgroundNotificationSeverityLow": "color",
      "colorBackgroundNotificationSeverityNeutral": "color",
      "colorTextNotificationSeverityCritical": "color",
      "colorTextNotificationSeverityHigh": "color",
      "colorTextNotificationSeverityMedium": "color",
      "colorTextNotificationSeverityLow": "color",
      "colorTextNotificationSeverityNeutral": "color",
      "colorGreyOpaque10": "color",
      "colorGreyOpaque25": "color",
      "colorGreyOpaque40": "color",
      "colorGreyOpaque50": "color",
      "colorGreyOpaque70": "color",
      "colorGreyOpaque80": "color",
      "colorGreyOpaque90": "color",
      "colorGreyTransparent": "color",
      "colorGreyTransparentHeavy": "color",
      "colorGreyTransparentLight": "color",
      "colorBackgroundBadgeIcon": "color",
      "colorBackgroundButtonLinkActive": "color",
      "colorBackgroundButtonLinkHover": "color",
      "colorBackgroundButtonNormalActive": "color",
      "colorBackgroundButtonNormalDefault": "color",
      "colorBackgroundButtonNormalDisabled": "color",
      "colorBackgroundButtonNormalHover": "color",
      "colorBackgroundToggleButtonNormalPressed": "color",
      "colorBackgroundButtonPrimaryActive": "color",
      "colorBackgroundButtonPrimaryDefault": "color",
      "colorBackgroundButtonPrimaryDisabled": "color",
      "colorBackgroundButtonPrimaryHover": "color",
      "colorBackgroundCalendarCurrentDate": "color",
      "colorBackgroundCellShaded": "color",
      "colorBackgroundCodeEditorGutterActiveLineDefault": "color",
      "colorBackgroundCodeEditorGutterActiveLineError": "color",
      "colorBackgroundCodeEditorGutterDefault": "color",
      "colorBackgroundCodeEditorLoading": "color",
      "colorBackgroundCodeEditorPaneItemHover": "color",
      "colorBackgroundCodeEditorStatusBar": "color",
      "colorBackgroundContainerContent": "color",
      "colorBackgroundContainerHeader": "color",
      "colorBackgroundControlChecked": "color",
      "colorBackgroundControlDefault": "color",
      "colorBackgroundControlDisabled": "color",
      "colorBackgroundDropdownItemDefault": "color",
      "colorBackgroundDropdownItemDimmed": "color",
      "colorBackgroundDropdownItemFilterMatch": "color",
      "colorBackgroundDropdownItemHover": "color",
      "colorBackgroundDropdownItemSelected": "color",
      "colorBackgroundHomeHeader": "color",
      "colorBackgroundInputDefault": "color",
      "colorBackgroundInputDisabled": "color",
      "colorBackgroundItemSelected": "color",
      "colorBackgroundLayoutMain": "color",
      "colorBackgroundLayoutMobilePanel": "color",
      "colorBackgroundLayoutPanelContent": "color",
      "colorBackgroundLayoutPanelHover": "color",
      "colorBackgroundLayoutToggleActive": "color",
      "colorBackgroundLayoutToggleDefault": "color",
      "colorBackgroundLayoutToggleHover": "color",
      "colorBackgroundLayoutToggleSelectedActive": "color",
      "colorBackgroundLayoutToggleSelectedDefault": "color",
      "colorBackgroundLayoutToggleSelectedHover": "color",
      "colorBackgroundModalOverlay": "color",
      "colorBackgroundNotificationBlue": "color",
      "colorBackgroundNotificationGreen": "color",
      "colorBackgroundNotificationGrey": "color",
      "colorBackgroundNotificationRed": "color",
      "colorBackgroundNotificationYellow": "color",
      "colorBackgroundNotificationStackBar": "color",
      "colorBackgroundNotificationStackBarActive": "color",
      "colorBackgroundNotificationStackBarHover": "color",
      "colorBackgroundPopover": "color",
      "colorBackgroundProgressBarContentDefault": "color",
      "colorBackgroundProgressBarContentInFlash": "color",
      "colorBackgroundProgressBarLayoutDefault": "color",
      "colorBackgroundProgressBarLayoutInFlash": "color",
      "colorBackgroundSegmentActive": "color",
      "colorBackgroundSegmentDefault": "color",
      "colorBackgroundSegmentDisabled": "color",
      "colorBackgroundSegmentHover": "color",
      "colorBackgroundSliderHandleDefault": "color",
      "colorBackgroundSliderHandleActive": "color",
      "colorBackgroundSliderTrack": "color",
      "colorBackgroundSliderHandleRing": "color",
      "colorBackgroundSliderErrorPressed": "color",
      "colorBackgroundSliderWarningPressed": "color",
      "colorBackgroundStatusError": "color",
      "colorBackgroundStatusInfo": "color",
      "colorBackgroundStatusSuccess": "color",
      "colorBackgroundStatusWarning": "color",
      "colorBackgroundTableHeader": "color",
      "colorBackgroundTilesDisabled": "color",
      "colorBackgroundToggleCheckedDisabled": "color",
      "colorBackgroundToggleDefault": "color",
      "colorBackgroundAvatarGenAi": "color",
      "colorBackgroundAvatarDefault": "color",
      "colorTextAvatar": "color",
      "colorBackgroundLoadingBarGenAi": "color",
      "colorBackgroundChatBubbleOutgoing": "color",
      "colorBackgroundChatBubbleIncoming": "color",
      "colorTextChatBubbleOutgoing": "color",
      "colorTextChatBubbleIncoming": "color",
      "colorBorderButtonNormalActive": "color",
      "colorBorderButtonNormalDefault": "color",
      "colorBorderToggleButtonNormalPressed": "color",
      "colorBorderButtonNormalDisabled": "color",
      "colorTextButtonNormalDisabled": "color",
      "colorBorderButtonNormalHover": "color",
      "colorBorderButtonPrimaryDisabled": "color",
      "colorTextButtonPrimaryDisabled": "color",
      "colorBorderCalendarGrid": "color",
      "colorBorderCalendarGridSelectedFocusRing": "color",
      "colorBorderCodeEditorAceActiveLineLightTheme": "color",
      "colorBorderCodeEditorAceActiveLineDarkTheme": "color",
      "colorBorderCodeEditorDefault": "color",
      "colorBorderCodeEditorPaneItemHover": "color",
      "colorBorderContainerDivider": "color",
      "colorBorderContainerTop": "color",
      "colorBorderControlChecked": "color",
      "colorBorderControlDefault": "color",
      "colorBorderControlDisabled": "color",
      "colorBorderDividerActive": "color",
      "colorBorderDividerDefault": "color",
      "colorBorderDividerPanelBottom": "color",
      "colorBorderDividerPanelSide": "color",
      "colorBorderDividerSecondary": "color",
      "colorBorderDropdownContainer": "color",
      "colorBorderDropdownGroup": "color",
      "colorBorderDropdownItemDefault": "color",
      "colorBorderDropdownItemHover": "color",
      "colorBorderDropdownItemDimmedHover": "color",
      "colorBorderDropdownItemSelected": "color",
      "colorBorderDropdownItemTop": "color",
      "colorBorderEditableCellHover": "color",
      "colorBorderInputDefault": "color",
      "colorBorderInputDisabled": "color",
      "colorBorderInputFocused": "color",
      "colorBorderItemFocused": "color",
      "colorBorderDropdownItemFocused": "color",
      "colorBorderItemPlaceholder": "color",
      "colorBorderItemSelected": "color",
      "colorBorderLayout": "color",
      "colorBorderNotificationStackBar": "color",
      "colorBorderPanelHeader": "color",
      "colorBorderPopover": "color",
      "colorBorderSegmentActive": "color",
      "colorBorderSegmentDefault": "color",
      "colorBorderSegmentDisabled": "color",
      "colorBorderSegmentHover": "color",
      "colorBorderStatusError": "color",
      "colorBorderStatusInfo": "color",
      "colorBorderStatusSuccess": "color",
      "colorBorderStatusWarning": "color",
      "colorBorderDividerInteractiveDefault": "color",
      "colorBorderTabsDivider": "color",
      "colorBorderTabsShadow": "color",
      "colorBorderTabsUnderline": "color",
      "colorBorderTilesDisabled": "color",
      "colorBorderTutorial": "color",
      "colorForegroundControlDefault": "color",
      "colorForegroundControlDisabled": "color",
      "colorForegroundControlReadOnly": "color",
      "colorShadowDefault": "color",
      "colorShadowMedium": "color",
      "colorShadowSide": "color",
      "colorStrokeChartLine": "color",
      "colorStrokeCodeEditorResizeHandler": "color",
      "colorStrokeCodeEditorGutterActiveLineDefault": "color",
      "colorStrokeCodeEditorGutterActiveLineHover": "color",
      "colorTextAccent": "color",
      "colorTextBodyDefault": "color",
      "colorTextBodySecondary": "color",
      "colorTextBreadcrumbCurrent": "color",
      "colorTextBreadcrumbIcon": "color",
      "colorTextButtonInlineIconDefault": "color",
      "colorTextButtonInlineIconDisabled": "color",
      "colorTextButtonInlineIconHover": "color",
      "colorTextButtonNormalActive": "color",
      "colorTextToggleButtonNormalPressed": "color",
      "colorTextButtonNormalDefault": "color",
      "colorTextButtonNormalHover": "color",
      "colorTextLinkButtonNormalDefault": "color",
      "colorTextLinkButtonNormalHover": "color",
      "colorTextLinkButtonNormalActive": "color",
      "colorTextButtonPrimaryActive": "color",
      "colorTextButtonPrimaryDefault": "color",
      "colorTextButtonPrimaryHover": "color",
      "colorTextCalendarDateHover": "color",
      "colorTextCalendarDateSelected": "color",
      "colorTextCalendarMonth": "color",
      "colorTextCodeEditorGutterActiveLine": "color",
      "colorTextCodeEditorGutterDefault": "color",
      "colorTextCodeEditorStatusBarDisabled": "color",
      "colorTextCodeEditorTabButtonError": "color",
      "colorTextColumnHeader": "color",
      "colorTextColumnSortingIcon": "color",
      "colorTextControlDisabled": "color",
      "colorTextCounter": "color",
      "colorTextDisabled": "color",
      "colorTextDisabledInlineEdit": "color",
      "colorTextDropdownFooter": "color",
      "colorTextDropdownGroupLabel": "color",
      "colorTextDropdownItemDefault": "color",
      "colorTextDropdownItemDimmed": "color",
      "colorTextDropdownItemDisabled": "color",
      "colorTextDropdownItemFilterMatch": "color",
      "colorTextDropdownItemHighlighted": "color",
      "colorTextDropdownItemSecondary": "color",
      "colorTextDropdownItemSecondaryHover": "color",
      "colorTextEmpty": "color",
      "colorTextExpandableSectionDefault": "color",
      "colorTextExpandableSectionHover": "color",
      "colorTextExpandableSectionNavigationIconDefault": "color",
      "colorTextFormDefault": "color",
      "colorTextFormLabel": "color",
      "colorTextFormSecondary": "color",
      "colorTextGroupLabel": "color",
      "colorTextLabelGenAi": "color",
      "colorTextHeadingDefault": "color",
      "colorTextHeadingSecondary": "color",
      "colorTextHomeHeaderDefault": "color",
      "colorTextHomeHeaderSecondary": "color",
      "colorTextIconCaret": "color",
      "colorTextIconSubtle": "color",
      "colorTextInputDisabled": "color",
      "colorTextInputPlaceholder": "color",
      "colorTextInputPlaceholderDisabled": "color",
      "colorTextInteractiveActive": "color",
      "colorTextInteractiveDefault": "color",
      "colorTextInteractiveDisabled": "color",
      "colorTextInteractiveHover": "color",
      "colorTextToggleButtonIconPressed": "color",
      "colorTextInteractiveInvertedDefault": "color",
      "colorTextInteractiveInvertedHover": "color",
      "colorTextInverted": "color",
      "colorTextLabel": "color",
      "colorTextLayoutToggle": "color",
      "colorTextLayoutToggleActive": "color",
      "colorTextLayoutToggleHover": "color",
      "colorTextLayoutToggleSelected": "color",
      "colorTextLinkDefault": "color",
      "colorTextLinkHover": "color",
      "colorTextLinkInvertedHover": "color",
      "colorTextLinkButtonUnderline": "color",
      "colorTextLinkButtonUnderlineHover": "color",
      "colorTextNotificationDefault": "color",
      "colorTextNotificationStackBar": "color",
      "colorTextNotificationYellow": "color",
      "colorTextPaginationPageNumberActiveDisabled": "color",
      "colorTextPaginationPageNumberDefault": "color",
      "colorTextSegmentActive": "color",
      "colorTextSegmentDefault": "color",
      "colorTextSegmentHover": "color",
      "colorTextSmall": "color",
      "colorTextStatusError": "color",
      "colorTextStatusInactive": "color",
      "colorTextStatusInfo": "color",
      "colorTextStatusSuccess": "color",
      "colorTextStatusWarning": "color",
      "colorTextTopNavigationTitle": "color",
      "colorBoardPlaceholderActive": "color",
      "colorBoardPlaceholderHover": "color",
      "colorDragPlaceholderActive": "color",
      "colorDragPlaceholderHover": "color",
      "colorDropzoneBackgroundDefault": "color",
      "colorDropzoneBackgroundHover": "color",
      "colorDropzoneTextDefault": "color",
      "colorDropzoneTextHover": "color",
      "colorDropzoneBorderDefault": "color",
      "colorDropzoneBorderHover": "color",
      "motionDurationExtraFast": "motion",
      "motionDurationExtraSlow": "motion",
      "motionDurationFast": "motion",
      "motionDurationModerate": "motion",
      "motionDurationRefreshOnlyAmbient": "motion",
      "motionDurationRefreshOnlyFast": "motion",
      "motionDurationRefreshOnlyMedium": "motion",
      "motionDurationRefreshOnlySlow": "motion",
      "motionDurationAvatarGenAiGradient": "motion",
      "motionDurationAvatarLoadingDots": "motion",
      "motionDurationRotate180": "motion",
      "motionDurationRotate90": "motion",
      "motionDurationShowPaced": "motion",
      "motionDurationShowQuick": "motion",
      "motionDurationSlow": "motion",
      "motionDurationTransitionQuick": "motion",
      "motionDurationTransitionShowPaced": "motion",
      "motionDurationTransitionShowQuick": "motion",
      "motionEasingEaseOutQuart": "motion",
      "motionEasingRefreshOnlyA": "motion",
      "motionEasingRefreshOnlyB": "motion",
      "motionEasingRefreshOnlyC": "motion",
      "motionEasingRefreshOnlyD": "motion",
      "motionEasingAvatarGenAiGradient": "motion",
      "motionEasingRotate180": "motion",
      "motionEasingRotate90": "motion",
      "motionEasingShowPaced": "motion",
      "motionEasingShowQuick": "motion",
      "motionEasingTransitionQuick": "motion",
      "motionEasingTransitionShowPaced": "motion",
      "motionEasingTransitionShowQuick": "motion",
      "motionEasingResponsive": "motion",
      "motionEasingSticky": "motion",
      "motionEasingExpressive": "motion",
      "motionDurationResponsive": "motion",
      "motionDurationExpressive": "motion",
      "motionDurationComplex": "motion",
      "motionKeyframesFadeIn": "motion",
      "motionKeyframesFadeOut": "motion",
      "motionKeyframesStatusIconError": "motion",
      "motionKeyframesScalePopup": "motion",
      "sizeCalendarGridWidth": "density",
      "sizeControl": "density",
      "sizeIconBig": "density",
      "sizeIconLarge": "density",
      "sizeIconMedium": "density",
      "sizeIconNormal": "density",
      "sizeTableSelectionHorizontal": "density",
      "sizeVerticalInput": "density",
      "sizeVerticalPanelIconOffset": "density",
      "spaceAlertActionLeft": "density",
      "spaceAlertHorizontal": "density",
      "spaceAlertMessageRight": "density",
      "spaceAlertVertical": "density",
      "spaceButtonFocusOutlineGutter": "density",
      "spaceButtonHorizontal": "density",
      "spaceButtonIconFocusOutlineGutterVertical": "density",
      "spaceButtonIconOnlyHorizontal": "density",
      "spaceButtonInlineIconFocusOutlineGutter": "density",
      "spaceButtonModalDismissVertical": "density",
      "spaceCalendarGridFocusOutlineGutter": "density",
      "spaceCalendarGridSelectedFocusOutlineGutter": "density",
      "spaceCalendarGridGutter": "density",
      "spaceCardHorizontal": "density",
      "spaceCardVertical": "density",
      "spaceCodeEditorStatusFocusOutlineGutter": "density",
      "spaceContainerContentTop": "density",
      "spaceContainerHeaderTop": "density",
      "spaceContainerHeaderBottom": "density",
      "spaceContainerHorizontal": "density",
      "spaceContentHeaderPaddingBottom": "density",
      "spaceDarkHeaderOverlapDistance": "density",
      "spaceExpandableSectionIconOffsetTop": "density",
      "spaceFieldHorizontal": "density",
      "spaceFieldIconOffset": "density",
      "spaceFilteringTokenDismissButtonFocusOutlineGutter": "density",
      "spaceFilteringTokenOperationSelectFocusOutlineGutter": "density",
      "spaceFlashbarActionLeft": "density",
      "spaceFlashbarDismissRight": "density",
      "spaceFlashbarHorizontal": "density",
      "spaceGridGutter": "density",
      "spaceKeyValueGap": "density",
      "spaceLayoutContentBottom": "density",
      "spaceLayoutContentHorizontal": "density",
      "spaceLayoutToggleDiameter": "density",
      "spaceLayoutTogglePadding": "density",
      "spaceModalContentBottom": "density",
      "spaceModalHorizontal": "density",
      "spaceOptionIconBigTop": "density",
      "spacePanelContentBottom": "density",
      "spacePanelContentTop": "density",
      "spacePanelDividerMarginHorizontal": "density",
      "spacePanelHeaderVertical": "density",
      "spacePanelNavLeft": "density",
      "spacePanelSideLeft": "density",
      "spacePanelSideRight": "density",
      "spacePanelSplitTop": "density",
      "spacePanelSplitBottom": "density",
      "spaceSegmentedControlFocusOutlineGutter": "density",
      "spaceTabsContentTop": "density",
      "spaceTabsFocusOutlineGutter": "density",
      "spaceTableContentBottom": "density",
      "spaceTableEmbeddedHeaderTop": "density",
      "spaceTableFooterHorizontal": "density",
      "spaceTableHeaderFocusOutlineGutter": "density",
      "spaceTableHeaderHorizontal": "density",
      "spaceTableHeaderToolsBottom": "density",
      "spaceTableHeaderToolsFullPageBottom": "density",
      "spaceTableHorizontal": "density",
      "spaceTileGutter": "density",
      "spaceScaled2xNone": "density",
      "spaceScaled2xXxxs": "density",
      "spaceScaled2xXxs": "density",
      "spaceScaled2xXs": "density",
      "spaceScaled2xS": "density",
      "spaceScaled2xM": "density",
      "spaceScaled2xL": "density",
      "spaceScaled2xXl": "density",
      "spaceScaled2xXxl": "density",
      "spaceScaled2xXxxl": "density",
      "spaceScaledNone": "density",
      "spaceScaledXxxs": "density",
      "spaceScaledXxs": "density",
      "spaceScaledXs": "density",
      "spaceScaledS": "density",
      "spaceScaledM": "density",
      "spaceScaledL": "density",
      "spaceScaledXl": "density",
      "spaceScaledXxl": "density",
      "spaceScaledXxxl": "density",
      "spaceStaticXxxs": "density",
      "spaceStaticXxs": "density",
      "spaceStaticXs": "density",
      "spaceStaticS": "density",
      "spaceStaticM": "density",
      "spaceStaticL": "density",
      "spaceStaticXl": "density",
      "spaceStaticXxl": "density",
      "spaceStaticXxxl": "density",
      "spaceNone": "density",
      "spaceXxxs": "density",
      "spaceXxs": "density",
      "spaceXs": "density",
      "spaceS": "density",
      "spaceM": "density",
      "spaceL": "density",
      "spaceXl": "density",
      "spaceXxl": "density",
      "spaceXxxl": "density",
      "shadowContainer": "color",
      "shadowContainerStacked": "color",
      "shadowContainerActive": "color",
      "shadowDropdown": "color",
      "shadowDropup": "color",
      "shadowFlashCollapsed": "color",
      "shadowFlashSticky": "color",
      "shadowModal": "color",
      "shadowPanel": "color",
      "shadowPanelToggle": "color",
      "shadowPopover": "color",
      "shadowSplitBottom": "color",
      "shadowSplitSide": "color",
      "shadowSticky": "color",
      "shadowStickyEmbedded": "color",
      "shadowStickyColumnFirst": "color",
      "shadowStickyColumnLast": "color"
    }
  },
  "secondary": [],
  "themeable": [
    "colorChartsStatusCritical",
    "colorChartsStatusHigh",
    "colorChartsStatusMedium",
    "colorChartsStatusLow",
    "colorChartsStatusPositive",
    "colorChartsStatusInfo",
    "colorChartsStatusNeutral",
    "colorChartsThresholdNegative",
    "colorChartsThresholdPositive",
    "colorChartsThresholdInfo",
    "colorChartsThresholdNeutral",
    "colorChartsPaletteCategorical1",
    "colorChartsPaletteCategorical2",
    "colorChartsPaletteCategorical3",
    "colorChartsPaletteCategorical4",
    "colorChartsPaletteCategorical5",
    "colorChartsPaletteCategorical6",
    "colorChartsPaletteCategorical7",
    "colorChartsPaletteCategorical8",
    "colorChartsPaletteCategorical9",
    "colorChartsPaletteCategorical10",
    "colorChartsPaletteCategorical11",
    "colorChartsPaletteCategorical12",
    "colorChartsPaletteCategorical13",
    "colorChartsPaletteCategorical14",
    "colorChartsPaletteCategorical15",
    "colorChartsPaletteCategorical16",
    "colorChartsPaletteCategorical17",
    "colorChartsPaletteCategorical18",
    "colorChartsPaletteCategorical19",
    "colorChartsPaletteCategorical20",
    "colorChartsPaletteCategorical21",
    "colorChartsPaletteCategorical22",
    "colorChartsPaletteCategorical23",
    "colorChartsPaletteCategorical24",
    "colorChartsPaletteCategorical25",
    "colorChartsPaletteCategorical26",
    "colorChartsPaletteCategorical27",
    "colorChartsPaletteCategorical28",
    "colorChartsPaletteCategorical29",
    "colorChartsPaletteCategorical30",
    "colorChartsPaletteCategorical31",
    "colorChartsPaletteCategorical32",
    "colorChartsPaletteCategorical33",
    "colorChartsPaletteCategorical34",
    "colorChartsPaletteCategorical35",
    "colorChartsPaletteCategorical36",
    "colorChartsPaletteCategorical37",
    "colorChartsPaletteCategorical38",
    "colorChartsPaletteCategorical39",
    "colorChartsPaletteCategorical40",
    "colorChartsPaletteCategorical41",
    "colorChartsPaletteCategorical42",
    "colorChartsPaletteCategorical43",
    "colorChartsPaletteCategorical44",
    "colorChartsPaletteCategorical45",
    "colorChartsPaletteCategorical46",
    "colorChartsPaletteCategorical47",
    "colorChartsPaletteCategorical48",
    "colorChartsPaletteCategorical49",
    "colorChartsPaletteCategorical50",
    "colorBackgroundNotificationSeverityCritical",
    "colorBackgroundNotificationSeverityHigh",
    "colorBackgroundNotificationSeverityMedium",
    "colorBackgroundNotificationSeverityLow",
    "colorBackgroundNotificationSeverityNeutral",
    "colorTextNotificationSeverityCritical",
    "colorTextNotificationSeverityHigh",
    "colorTextNotificationSeverityMedium",
    "colorTextNotificationSeverityLow",
    "colorTextNotificationSeverityNeutral",
    "colorBackgroundButtonNormalActive",
    "colorBackgroundButtonNormalDefault",
    "colorBackgroundButtonNormalDisabled",
    "colorBackgroundButtonNormalHover",
    "colorBackgroundToggleButtonNormalPressed",
    "colorBackgroundButtonPrimaryActive",
    "colorBackgroundButtonPrimaryDefault",
    "colorBackgroundButtonPrimaryDisabled",
    "colorBackgroundButtonPrimaryHover",
    "colorBackgroundCellShaded",
    "colorBackgroundContainerContent",
    "colorBackgroundContainerHeader",
    "colorBackgroundControlChecked",
    "colorBackgroundControlDefault",
    "colorBackgroundControlDisabled",
    "colorBackgroundDropdownItemDefault",
    "colorBackgroundDropdownItemFilterMatch",
    "colorBackgroundDropdownItemHover",
    "colorBackgroundHomeHeader",
    "colorBackgroundInputDefault",
    "colorBackgroundInputDisabled",
    "colorBackgroundItemSelected",
    "colorBackgroundLayoutMain",
    "colorBackgroundLayoutToggleActive",
    "colorBackgroundLayoutToggleDefault",
    "colorBackgroundLayoutToggleHover",
    "colorBackgroundLayoutToggleSelectedActive",
    "colorBackgroundLayoutToggleSelectedDefault",
    "colorBackgroundLayoutToggleSelectedHover",
    "colorBackgroundNotificationBlue",
    "colorBackgroundNotificationGreen",
    "colorBackgroundNotificationGrey",
    "colorBackgroundNotificationRed",
    "colorBackgroundNotificationYellow",
    "colorBackgroundPopover",
    "colorBackgroundSegmentActive",
    "colorBackgroundSegmentDefault",
    "colorBackgroundSegmentDisabled",
    "colorBackgroundSegmentHover",
    "colorBackgroundStatusError",
    "colorBackgroundStatusInfo",
    "colorBackgroundStatusSuccess",
    "colorBackgroundStatusWarning",
    "colorBackgroundToggleCheckedDisabled",
    "colorBackgroundChatBubbleOutgoing",
    "colorBackgroundChatBubbleIncoming",
    "colorTextChatBubbleOutgoing",
    "colorTextChatBubbleIncoming",
    "colorBorderButtonNormalActive",
    "colorBorderButtonNormalDefault",
    "colorBorderToggleButtonNormalPressed",
    "colorBorderButtonNormalDisabled",
    "colorTextButtonNormalDisabled",
    "colorBorderButtonNormalHover",
    "colorBorderButtonPrimaryDisabled",
    "colorTextButtonPrimaryDisabled",
    "colorBorderContainerTop",
    "colorBorderControlDefault",
    "colorBorderDividerDefault",
    "colorBorderDividerSecondary",
    "colorBorderDropdownItemHover",
    "colorBorderInputDefault",
    "colorBorderInputFocused",
    "colorBorderItemFocused",
    "colorBorderDropdownItemFocused",
    "colorBorderItemSelected",
    "colorBorderSegmentActive",
    "colorBorderSegmentDefault",
    "colorBorderSegmentDisabled",
    "colorBorderSegmentHover",
    "colorBorderStatusError",
    "colorBorderStatusInfo",
    "colorBorderStatusSuccess",
    "colorBorderStatusWarning",
    "colorForegroundControlDefault",
    "colorForegroundControlDisabled",
    "colorForegroundControlReadOnly",
    "colorTextAccent",
    "colorTextBodyDefault",
    "colorTextBodySecondary",
    "colorTextBreadcrumbCurrent",
    "colorTextBreadcrumbIcon",
    "colorTextButtonNormalActive",
    "colorTextToggleButtonNormalPressed",
    "colorTextButtonNormalDefault",
    "colorTextButtonNormalHover",
    "colorTextLinkButtonNormalDefault",
    "colorTextLinkButtonNormalHover",
    "colorTextLinkButtonNormalActive",
    "colorTextButtonPrimaryActive",
    "colorTextButtonPrimaryDefault",
    "colorTextButtonPrimaryHover",
    "colorTextCounter",
    "colorTextDropdownItemDefault",
    "colorTextDropdownItemDisabled",
    "colorTextDropdownItemFilterMatch",
    "colorTextDropdownItemHighlighted",
    "colorTextEmpty",
    "colorTextFormDefault",
    "colorTextFormSecondary",
    "colorTextGroupLabel",
    "colorTextHeadingDefault",
    "colorTextHeadingSecondary",
    "colorTextHomeHeaderDefault",
    "colorTextHomeHeaderSecondary",
    "colorTextInputDisabled",
    "colorTextInputPlaceholder",
    "colorTextInteractiveActive",
    "colorTextInteractiveDefault",
    "colorTextInteractiveDisabled",
    "colorTextInteractiveHover",
    "colorTextToggleButtonIconPressed",
    "colorTextInteractiveInvertedDefault",
    "colorTextInteractiveInvertedHover",
    "colorTextLabel",
    "colorTextLayoutToggle",
    "colorTextLayoutToggleActive",
    "colorTextLayoutToggleHover",
    "colorTextLayoutToggleSelected",
    "colorTextLinkDefault",
    "colorTextLinkHover",
    "colorTextNotificationDefault",
    "colorTextSegmentActive",
    "colorTextSegmentDefault",
    "colorTextSegmentHover",
    "colorTextStatusError",
    "colorTextStatusInactive",
    "colorTextStatusInfo",
    "colorTextStatusSuccess",
    "colorTextStatusWarning",
    "colorTextTopNavigationTitle",
    "fontFamilyBase",
    "fontFamilyMonospace",
    "fontSizeBodyM",
    "fontSizeBodyS",
    "fontSizeDisplayL",
    "fontSizeHeadingXl",
    "fontSizeHeadingL",
    "fontSizeHeadingM",
    "fontSizeHeadingS",
    "fontSizeHeadingXs",
    "fontWeightButton",
    "fontWeightHeadingXl",
    "fontWeightHeadingL",
    "fontWeightHeadingM",
    "fontWeightHeadingS",
    "fontWeightHeadingXs",
    "lineHeightBodyM",
    "lineHeightBodyS",
    "lineHeightDisplayL",
    "lineHeightHeadingXl",
    "lineHeightHeadingL",
    "lineHeightHeadingM",
    "lineHeightHeadingS",
    "lineHeightHeadingXs",
    "borderRadiusAlert",
    "borderRadiusBadge",
    "borderRadiusButton",
    "borderRadiusCalendarDayFocusRing",
    "borderRadiusContainer",
    "borderRadiusControlCircularFocusRing",
    "borderRadiusControlDefaultFocusRing",
    "borderRadiusDropdown",
    "borderRadiusFlashbar",
    "borderRadiusItem",
    "borderRadiusInput",
    "borderRadiusPopover",
    "borderRadiusTabsFocusRing",
    "borderRadiusTiles",
    "borderRadiusToken",
    "borderRadiusTutorialPanelItem",
    "borderWidthAlert",
    "borderWidthField",
    "borderWidthPopover"
  ],
  "exposed": [
    "colorChartsRed300",
    "colorChartsRed400",
    "colorChartsRed500",
    "colorChartsRed600",
    "colorChartsRed700",
    "colorChartsRed800",
    "colorChartsRed900",
    "colorChartsRed1000",
    "colorChartsRed1100",
    "colorChartsRed1200",
    "colorChartsOrange300",
    "colorChartsOrange400",
    "colorChartsOrange500",
    "colorChartsOrange600",
    "colorChartsOrange700",
    "colorChartsOrange800",
    "colorChartsOrange900",
    "colorChartsOrange1000",
    "colorChartsOrange1100",
    "colorChartsOrange1200",
    "colorChartsYellow300",
    "colorChartsYellow400",
    "colorChartsYellow500",
    "colorChartsYellow600",
    "colorChartsYellow700",
    "colorChartsYellow800",
    "colorChartsYellow900",
    "colorChartsYellow1000",
    "colorChartsYellow1100",
    "colorChartsYellow1200",
    "colorChartsGreen300",
    "colorChartsGreen400",
    "colorChartsGreen500",
    "colorChartsGreen600",
    "colorChartsGreen700",
    "colorChartsGreen800",
    "colorChartsGreen900",
    "colorChartsGreen1000",
    "colorChartsGreen1100",
    "colorChartsGreen1200",
    "colorChartsTeal300",
    "colorChartsTeal400",
    "colorChartsTeal500",
    "colorChartsTeal600",
    "colorChartsTeal700",
    "colorChartsTeal800",
    "colorChartsTeal900",
    "colorChartsTeal1000",
    "colorChartsTeal1100",
    "colorChartsTeal1200",
    "colorChartsBlue1300",
    "colorChartsBlue1400",
    "colorChartsBlue1500",
    "colorChartsBlue1600",
    "colorChartsBlue1700",
    "colorChartsBlue1800",
    "colorChartsBlue1900",
    "colorChartsBlue11000",
    "colorChartsBlue11100",
    "colorChartsBlue11200",
    "colorChartsBlue2300",
    "colorChartsBlue2400",
    "colorChartsBlue2500",
    "colorChartsBlue2600",
    "colorChartsBlue2700",
    "colorChartsBlue2800",
    "colorChartsBlue2900",
    "colorChartsBlue21000",
    "colorChartsBlue21100",
    "colorChartsBlue21200",
    "colorChartsPurple300",
    "colorChartsPurple400",
    "colorChartsPurple500",
    "colorChartsPurple600",
    "colorChartsPurple700",
    "colorChartsPurple800",
    "colorChartsPurple900",
    "colorChartsPurple1000",
    "colorChartsPurple1100",
    "colorChartsPurple1200",
    "colorChartsPink300",
    "colorChartsPink400",
    "colorChartsPink500",
    "colorChartsPink600",
    "colorChartsPink700",
    "colorChartsPink800",
    "colorChartsPink900",
    "colorChartsPink1000",
    "colorChartsPink1100",
    "colorChartsPink1200",
    "colorChartsStatusCritical",
    "colorChartsStatusHigh",
    "colorChartsStatusMedium",
    "colorChartsStatusLow",
    "colorChartsStatusPositive",
    "colorChartsStatusInfo",
    "colorChartsStatusNeutral",
    "colorChartsThresholdNegative",
    "colorChartsThresholdPositive",
    "colorChartsThresholdInfo",
    "colorChartsThresholdNeutral",
    "colorChartsLineGrid",
    "colorChartsLineTick",
    "colorChartsLineAxis",
    "colorChartsPaletteCategorical1",
    "colorChartsPaletteCategorical2",
    "colorChartsPaletteCategorical3",
    "colorChartsPaletteCategorical4",
    "colorChartsPaletteCategorical5",
    "colorChartsPaletteCategorical6",
    "colorChartsPaletteCategorical7",
    "colorChartsPaletteCategorical8",
    "colorChartsPaletteCategorical9",
    "colorChartsPaletteCategorical10",
    "colorChartsPaletteCategorical11",
    "colorChartsPaletteCategorical12",
    "colorChartsPaletteCategorical13",
    "colorChartsPaletteCategorical14",
    "colorChartsPaletteCategorical15",
    "colorChartsPaletteCategorical16",
    "colorChartsPaletteCategorical17",
    "colorChartsPaletteCategorical18",
    "colorChartsPaletteCategorical19",
    "colorChartsPaletteCategorical20",
    "colorChartsPaletteCategorical21",
    "colorChartsPaletteCategorical22",
    "colorChartsPaletteCategorical23",
    "colorChartsPaletteCategorical24",
    "colorChartsPaletteCategorical25",
    "colorChartsPaletteCategorical26",
    "colorChartsPaletteCategorical27",
    "colorChartsPaletteCategorical28",
    "colorChartsPaletteCategorical29",
    "colorChartsPaletteCategorical30",
    "colorChartsPaletteCategorical31",
    "colorChartsPaletteCategorical32",
    "colorChartsPaletteCategorical33",
    "colorChartsPaletteCategorical34",
    "colorChartsPaletteCategorical35",
    "colorChartsPaletteCategorical36",
    "colorChartsPaletteCategorical37",
    "colorChartsPaletteCategorical38",
    "colorChartsPaletteCategorical39",
    "colorChartsPaletteCategorical40",
    "colorChartsPaletteCategorical41",
    "colorChartsPaletteCategorical42",
    "colorChartsPaletteCategorical43",
    "colorChartsPaletteCategorical44",
    "colorChartsPaletteCategorical45",
    "colorChartsPaletteCategorical46",
    "colorChartsPaletteCategorical47",
    "colorChartsPaletteCategorical48",
    "colorChartsPaletteCategorical49",
    "colorChartsPaletteCategorical50",
    "colorBackgroundNotificationSeverityCritical",
    "colorBackgroundNotificationSeverityHigh",
    "colorBackgroundNotificationSeverityMedium",
    "colorBackgroundNotificationSeverityLow",
    "colorBackgroundNotificationSeverityNeutral",
    "colorTextNotificationSeverityCritical",
    "colorTextNotificationSeverityHigh",
    "colorTextNotificationSeverityMedium",
    "colorTextNotificationSeverityLow",
    "colorTextNotificationSeverityNeutral",
    "colorBackgroundButtonNormalActive",
    "colorBackgroundButtonNormalDefault",
    "colorBackgroundButtonNormalDisabled",
    "colorBackgroundButtonNormalHover",
    "colorBackgroundToggleButtonNormalPressed",
    "colorBackgroundButtonPrimaryActive",
    "colorBackgroundButtonPrimaryDefault",
    "colorBackgroundButtonPrimaryDisabled",
    "colorBackgroundButtonPrimaryHover",
    "colorBackgroundCellShaded",
    "colorBackgroundContainerContent",
    "colorBackgroundContainerHeader",
    "colorBackgroundControlChecked",
    "colorBackgroundControlDefault",
    "colorBackgroundControlDisabled",
    "colorBackgroundDropdownItemDefault",
    "colorBackgroundDropdownItemFilterMatch",
    "colorBackgroundDropdownItemHover",
    "colorBackgroundHomeHeader",
    "colorBackgroundInputDefault",
    "colorBackgroundInputDisabled",
    "colorBackgroundItemSelected",
    "colorBackgroundLayoutMain",
    "colorBackgroundLayoutToggleActive",
    "colorBackgroundLayoutToggleDefault",
    "colorBackgroundLayoutToggleHover",
    "colorBackgroundLayoutToggleSelectedActive",
    "colorBackgroundLayoutToggleSelectedDefault",
    "colorBackgroundLayoutToggleSelectedHover",
    "colorBackgroundNotificationBlue",
    "colorBackgroundNotificationGreen",
    "colorBackgroundNotificationGrey",
    "colorBackgroundNotificationRed",
    "colorBackgroundNotificationYellow",
    "colorBackgroundPopover",
    "colorBackgroundSegmentActive",
    "colorBackgroundSegmentDefault",
    "colorBackgroundSegmentDisabled",
    "colorBackgroundSegmentHover",
    "colorBackgroundStatusError",
    "colorBackgroundStatusInfo",
    "colorBackgroundStatusSuccess",
    "colorBackgroundStatusWarning",
    "colorBackgroundToggleCheckedDisabled",
    "colorBackgroundAvatarGenAi",
    "colorBackgroundAvatarDefault",
    "colorTextAvatar",
    "colorBackgroundLoadingBarGenAi",
    "colorBackgroundChatBubbleOutgoing",
    "colorBackgroundChatBubbleIncoming",
    "colorTextChatBubbleOutgoing",
    "colorTextChatBubbleIncoming",
    "colorBorderButtonNormalActive",
    "colorBorderButtonNormalDefault",
    "colorBorderToggleButtonNormalPressed",
    "colorBorderButtonNormalDisabled",
    "colorTextButtonNormalDisabled",
    "colorBorderButtonNormalHover",
    "colorBorderButtonPrimaryDisabled",
    "colorTextButtonPrimaryDisabled",
    "colorBorderContainerTop",
    "colorBorderControlDefault",
    "colorBorderDividerDefault",
    "colorBorderDividerSecondary",
    "colorBorderDropdownItemHover",
    "colorBorderInputDefault",
    "colorBorderInputFocused",
    "colorBorderItemFocused",
    "colorBorderDropdownItemFocused",
    "colorBorderItemSelected",
    "colorBorderSegmentActive",
    "colorBorderSegmentDefault",
    "colorBorderSegmentDisabled",
    "colorBorderSegmentHover",
    "colorBorderStatusError",
    "colorBorderStatusInfo",
    "colorBorderStatusSuccess",
    "colorBorderStatusWarning",
    "colorForegroundControlDefault",
    "colorForegroundControlDisabled",
    "colorForegroundControlReadOnly",
    "colorTextAccent",
    "colorTextBodyDefault",
    "colorTextBodySecondary",
    "colorTextBreadcrumbCurrent",
    "colorTextBreadcrumbIcon",
    "colorTextButtonNormalActive",
    "colorTextToggleButtonNormalPressed",
    "colorTextButtonNormalDefault",
    "colorTextButtonNormalHover",
    "colorTextButtonPrimaryActive",
    "colorTextButtonPrimaryDefault",
    "colorTextButtonPrimaryHover",
    "colorTextCounter",
    "colorTextDropdownItemDefault",
    "colorTextDropdownItemDisabled",
    "colorTextDropdownItemFilterMatch",
    "colorTextDropdownItemHighlighted",
    "colorTextEmpty",
    "colorTextFormDefault",
    "colorTextFormSecondary",
    "colorTextGroupLabel",
    "colorTextLabelGenAi",
    "colorTextHeadingDefault",
    "colorTextHeadingSecondary",
    "colorTextHomeHeaderDefault",
    "colorTextHomeHeaderSecondary",
    "colorTextInputDisabled",
    "colorTextInputPlaceholder",
    "colorTextInteractiveActive",
    "colorTextInteractiveDefault",
    "colorTextInteractiveDisabled",
    "colorTextInteractiveHover",
    "colorTextToggleButtonIconPressed",
    "colorTextInteractiveInvertedDefault",
    "colorTextInteractiveInvertedHover",
    "colorTextLabel",
    "colorTextLayoutToggle",
    "colorTextLayoutToggleActive",
    "colorTextLayoutToggleHover",
    "colorTextLayoutToggleSelected",
    "colorTextLinkDefault",
    "colorTextLinkHover",
    "colorTextNotificationDefault",
    "colorTextSegmentActive",
    "colorTextSegmentDefault",
    "colorTextSegmentHover",
    "colorTextStatusError",
    "colorTextStatusInactive",
    "colorTextStatusInfo",
    "colorTextStatusSuccess",
    "colorTextStatusWarning",
    "colorTextTopNavigationTitle",
    "colorBoardPlaceholderActive",
    "colorBoardPlaceholderHover",
    "colorDragPlaceholderActive",
    "colorDragPlaceholderHover",
    "fontFamilyBase",
    "fontFamilyMonospace",
    "fontSizeBodyM",
    "fontSizeBodyS",
    "fontSizeDisplayL",
    "fontSizeHeadingXl",
    "fontSizeHeadingL",
    "fontSizeHeadingM",
    "fontSizeHeadingS",
    "fontSizeHeadingXs",
    "fontWeightButton",
    "fontWeightHeadingXl",
    "fontWeightHeadingL",
    "fontWeightHeadingM",
    "fontWeightHeadingS",
    "fontWeightHeadingXs",
    "lineHeightBodyM",
    "lineHeightBodyS",
    "lineHeightDisplayL",
    "lineHeightHeadingXl",
    "lineHeightHeadingL",
    "lineHeightHeadingM",
    "lineHeightHeadingS",
    "lineHeightHeadingXs",
    "borderRadiusAlert",
    "borderRadiusBadge",
    "borderRadiusButton",
    "borderRadiusCalendarDayFocusRing",
    "borderRadiusContainer",
    "borderRadiusControlCircularFocusRing",
    "borderRadiusControlDefaultFocusRing",
    "borderRadiusDropdown",
    "borderRadiusFlashbar",
    "borderRadiusItem",
    "borderRadiusInput",
    "borderRadiusPopover",
    "borderRadiusTabsFocusRing",
    "borderRadiusTiles",
    "borderRadiusToken",
    "borderRadiusChatBubble",
    "borderRadiusTutorialPanelItem",
    "borderWidthAlert",
    "borderWidthField",
    "borderWidthPopover",
    "motionDurationAvatarGenAiGradient",
    "motionDurationAvatarLoadingDots",
    "motionEasingAvatarGenAiGradient",
    "motionEasingResponsive",
    "motionEasingSticky",
    "motionEasingExpressive",
    "motionDurationResponsive",
    "motionDurationExpressive",
    "motionDurationComplex",
    "motionKeyframesFadeIn",
    "motionKeyframesFadeOut",
    "motionKeyframesStatusIconError",
    "motionKeyframesScalePopup",
    "spaceContainerHorizontal",
    "spaceFieldHorizontal",
    "spaceScaledXxxs",
    "spaceScaledXxs",
    "spaceScaledXs",
    "spaceScaledS",
    "spaceScaledM",
    "spaceScaledL",
    "spaceScaledXl",
    "spaceScaledXxl",
    "spaceScaledXxxl",
    "spaceStaticXxxs",
    "spaceStaticXxs",
    "spaceStaticXs",
    "spaceStaticS",
    "spaceStaticM",
    "spaceStaticL",
    "spaceStaticXl",
    "spaceStaticXxl",
    "spaceStaticXxxl",
    "shadowContainerActive"
  ],
  "variablesMap": {
    "colorAmazonOrange": "color-amazon-orange",
    "colorAwsSquidInk": "color-aws-squid-ink",
    "colorBlack": "color-black",
    "colorBlue100": "color-blue-100",
    "colorBlue200": "color-blue-200",
    "colorBlue300": "color-blue-300",
    "colorBlue400": "color-blue-400",
    "colorBlue500": "color-blue-500",
    "colorBlue600": "color-blue-600",
    "colorBlue700": "color-blue-700",
    "colorBlue800": "color-blue-800",
    "colorBlue900": "color-blue-900",
    "colorBlueOpaque": "color-blue-opaque",
    "colorGreen100": "color-green-100",
    "colorGreen500": "color-green-500",
    "colorGreen600": "color-green-600",
    "colorGreen700": "color-green-700",
    "colorGreen900": "color-green-900",
    "colorGrey100": "color-grey-100",
    "colorGrey125": "color-grey-125",
    "colorGrey150": "color-grey-150",
    "colorGrey200": "color-grey-200",
    "colorGrey300": "color-grey-300",
    "colorGrey350": "color-grey-350",
    "colorGrey400": "color-grey-400",
    "colorGrey450": "color-grey-450",
    "colorGrey500": "color-grey-500",
    "colorGrey550": "color-grey-550",
    "colorGrey600": "color-grey-600",
    "colorGrey650": "color-grey-650",
    "colorGrey700": "color-grey-700",
    "colorGrey750": "color-grey-750",
    "colorGrey800": "color-grey-800",
    "colorGrey850": "color-grey-850",
    "colorGrey900": "color-grey-900",
    "colorGrey950": "color-grey-950",
    "colorOrange100": "color-orange-100",
    "colorOrange500": "color-orange-500",
    "colorOrange600": "color-orange-600",
    "colorOrange700": "color-orange-700",
    "colorPurple400": "color-purple-400",
    "colorPurple600": "color-purple-600",
    "colorRed100": "color-red-100",
    "colorRed500": "color-red-500",
    "colorRed600": "color-red-600",
    "colorRed700": "color-red-700",
    "colorRed900": "color-red-900",
    "colorTransparent": "color-transparent",
    "colorWhite": "color-white",
    "colorYellow100": "color-yellow-100",
    "colorYellow600": "color-yellow-600",
    "colorYellow700": "color-yellow-700",
    "colorYellow800": "color-yellow-800",
    "colorYellow900": "color-yellow-900",
    "colorChartsRed300": "color-charts-red-300",
    "colorChartsRed400": "color-charts-red-400",
    "colorChartsRed500": "color-charts-red-500",
    "colorChartsRed600": "color-charts-red-600",
    "colorChartsRed700": "color-charts-red-700",
    "colorChartsRed800": "color-charts-red-800",
    "colorChartsRed900": "color-charts-red-900",
    "colorChartsRed1000": "color-charts-red-1000",
    "colorChartsRed1100": "color-charts-red-1100",
    "colorChartsRed1200": "color-charts-red-1200",
    "colorChartsOrange300": "color-charts-orange-300",
    "colorChartsOrange400": "color-charts-orange-400",
    "colorChartsOrange500": "color-charts-orange-500",
    "colorChartsOrange600": "color-charts-orange-600",
    "colorChartsOrange700": "color-charts-orange-700",
    "colorChartsOrange800": "color-charts-orange-800",
    "colorChartsOrange900": "color-charts-orange-900",
    "colorChartsOrange1000": "color-charts-orange-1000",
    "colorChartsOrange1100": "color-charts-orange-1100",
    "colorChartsOrange1200": "color-charts-orange-1200",
    "colorChartsYellow300": "color-charts-yellow-300",
    "colorChartsYellow400": "color-charts-yellow-400",
    "colorChartsYellow500": "color-charts-yellow-500",
    "colorChartsYellow600": "color-charts-yellow-600",
    "colorChartsYellow700": "color-charts-yellow-700",
    "colorChartsYellow800": "color-charts-yellow-800",
    "colorChartsYellow900": "color-charts-yellow-900",
    "colorChartsYellow1000": "color-charts-yellow-1000",
    "colorChartsYellow1100": "color-charts-yellow-1100",
    "colorChartsYellow1200": "color-charts-yellow-1200",
    "colorChartsGreen300": "color-charts-green-300",
    "colorChartsGreen400": "color-charts-green-400",
    "colorChartsGreen500": "color-charts-green-500",
    "colorChartsGreen600": "color-charts-green-600",
    "colorChartsGreen700": "color-charts-green-700",
    "colorChartsGreen800": "color-charts-green-800",
    "colorChartsGreen900": "color-charts-green-900",
    "colorChartsGreen1000": "color-charts-green-1000",
    "colorChartsGreen1100": "color-charts-green-1100",
    "colorChartsGreen1200": "color-charts-green-1200",
    "colorChartsTeal300": "color-charts-teal-300",
    "colorChartsTeal400": "color-charts-teal-400",
    "colorChartsTeal500": "color-charts-teal-500",
    "colorChartsTeal600": "color-charts-teal-600",
    "colorChartsTeal700": "color-charts-teal-700",
    "colorChartsTeal800": "color-charts-teal-800",
    "colorChartsTeal900": "color-charts-teal-900",
    "colorChartsTeal1000": "color-charts-teal-1000",
    "colorChartsTeal1100": "color-charts-teal-1100",
    "colorChartsTeal1200": "color-charts-teal-1200",
    "colorChartsBlue1300": "color-charts-blue-1-300",
    "colorChartsBlue1400": "color-charts-blue-1-400",
    "colorChartsBlue1500": "color-charts-blue-1-500",
    "colorChartsBlue1600": "color-charts-blue-1-600",
    "colorChartsBlue1700": "color-charts-blue-1-700",
    "colorChartsBlue1800": "color-charts-blue-1-800",
    "colorChartsBlue1900": "color-charts-blue-1-900",
    "colorChartsBlue11000": "color-charts-blue-1-1000",
    "colorChartsBlue11100": "color-charts-blue-1-1100",
    "colorChartsBlue11200": "color-charts-blue-1-1200",
    "colorChartsBlue2300": "color-charts-blue-2-300",
    "colorChartsBlue2400": "color-charts-blue-2-400",
    "colorChartsBlue2500": "color-charts-blue-2-500",
    "colorChartsBlue2600": "color-charts-blue-2-600",
    "colorChartsBlue2700": "color-charts-blue-2-700",
    "colorChartsBlue2800": "color-charts-blue-2-800",
    "colorChartsBlue2900": "color-charts-blue-2-900",
    "colorChartsBlue21000": "color-charts-blue-2-1000",
    "colorChartsBlue21100": "color-charts-blue-2-1100",
    "colorChartsBlue21200": "color-charts-blue-2-1200",
    "colorChartsPurple300": "color-charts-purple-300",
    "colorChartsPurple400": "color-charts-purple-400",
    "colorChartsPurple500": "color-charts-purple-500",
    "colorChartsPurple600": "color-charts-purple-600",
    "colorChartsPurple700": "color-charts-purple-700",
    "colorChartsPurple800": "color-charts-purple-800",
    "colorChartsPurple900": "color-charts-purple-900",
    "colorChartsPurple1000": "color-charts-purple-1000",
    "colorChartsPurple1100": "color-charts-purple-1100",
    "colorChartsPurple1200": "color-charts-purple-1200",
    "colorChartsPink300": "color-charts-pink-300",
    "colorChartsPink400": "color-charts-pink-400",
    "colorChartsPink500": "color-charts-pink-500",
    "colorChartsPink600": "color-charts-pink-600",
    "colorChartsPink700": "color-charts-pink-700",
    "colorChartsPink800": "color-charts-pink-800",
    "colorChartsPink900": "color-charts-pink-900",
    "colorChartsPink1000": "color-charts-pink-1000",
    "colorChartsPink1100": "color-charts-pink-1100",
    "colorChartsPink1200": "color-charts-pink-1200",
    "colorChartsStatusCritical": "color-charts-status-critical",
    "colorChartsStatusHigh": "color-charts-status-high",
    "colorChartsStatusMedium": "color-charts-status-medium",
    "colorChartsStatusLow": "color-charts-status-low",
    "colorChartsStatusPositive": "color-charts-status-positive",
    "colorChartsStatusInfo": "color-charts-status-info",
    "colorChartsStatusNeutral": "color-charts-status-neutral",
    "colorChartsThresholdNegative": "color-charts-threshold-negative",
    "colorChartsThresholdPositive": "color-charts-threshold-positive",
    "colorChartsThresholdInfo": "color-charts-threshold-info",
    "colorChartsThresholdNeutral": "color-charts-threshold-neutral",
    "colorChartsLineGrid": "color-charts-line-grid",
    "colorChartsLineTick": "color-charts-line-tick",
    "colorChartsLineAxis": "color-charts-line-axis",
    "colorChartsPaletteCategorical1": "color-charts-palette-categorical-1",
    "colorChartsPaletteCategorical2": "color-charts-palette-categorical-2",
    "colorChartsPaletteCategorical3": "color-charts-palette-categorical-3",
    "colorChartsPaletteCategorical4": "color-charts-palette-categorical-4",
    "colorChartsPaletteCategorical5": "color-charts-palette-categorical-5",
    "colorChartsPaletteCategorical6": "color-charts-palette-categorical-6",
    "colorChartsPaletteCategorical7": "color-charts-palette-categorical-7",
    "colorChartsPaletteCategorical8": "color-charts-palette-categorical-8",
    "colorChartsPaletteCategorical9": "color-charts-palette-categorical-9",
    "colorChartsPaletteCategorical10": "color-charts-palette-categorical-10",
    "colorChartsPaletteCategorical11": "color-charts-palette-categorical-11",
    "colorChartsPaletteCategorical12": "color-charts-palette-categorical-12",
    "colorChartsPaletteCategorical13": "color-charts-palette-categorical-13",
    "colorChartsPaletteCategorical14": "color-charts-palette-categorical-14",
    "colorChartsPaletteCategorical15": "color-charts-palette-categorical-15",
    "colorChartsPaletteCategorical16": "color-charts-palette-categorical-16",
    "colorChartsPaletteCategorical17": "color-charts-palette-categorical-17",
    "colorChartsPaletteCategorical18": "color-charts-palette-categorical-18",
    "colorChartsPaletteCategorical19": "color-charts-palette-categorical-19",
    "colorChartsPaletteCategorical20": "color-charts-palette-categorical-20",
    "colorChartsPaletteCategorical21": "color-charts-palette-categorical-21",
    "colorChartsPaletteCategorical22": "color-charts-palette-categorical-22",
    "colorChartsPaletteCategorical23": "color-charts-palette-categorical-23",
    "colorChartsPaletteCategorical24": "color-charts-palette-categorical-24",
    "colorChartsPaletteCategorical25": "color-charts-palette-categorical-25",
    "colorChartsPaletteCategorical26": "color-charts-palette-categorical-26",
    "colorChartsPaletteCategorical27": "color-charts-palette-categorical-27",
    "colorChartsPaletteCategorical28": "color-charts-palette-categorical-28",
    "colorChartsPaletteCategorical29": "color-charts-palette-categorical-29",
    "colorChartsPaletteCategorical30": "color-charts-palette-categorical-30",
    "colorChartsPaletteCategorical31": "color-charts-palette-categorical-31",
    "colorChartsPaletteCategorical32": "color-charts-palette-categorical-32",
    "colorChartsPaletteCategorical33": "color-charts-palette-categorical-33",
    "colorChartsPaletteCategorical34": "color-charts-palette-categorical-34",
    "colorChartsPaletteCategorical35": "color-charts-palette-categorical-35",
    "colorChartsPaletteCategorical36": "color-charts-palette-categorical-36",
    "colorChartsPaletteCategorical37": "color-charts-palette-categorical-37",
    "colorChartsPaletteCategorical38": "color-charts-palette-categorical-38",
    "colorChartsPaletteCategorical39": "color-charts-palette-categorical-39",
    "colorChartsPaletteCategorical40": "color-charts-palette-categorical-40",
    "colorChartsPaletteCategorical41": "color-charts-palette-categorical-41",
    "colorChartsPaletteCategorical42": "color-charts-palette-categorical-42",
    "colorChartsPaletteCategorical43": "color-charts-palette-categorical-43",
    "colorChartsPaletteCategorical44": "color-charts-palette-categorical-44",
    "colorChartsPaletteCategorical45": "color-charts-palette-categorical-45",
    "colorChartsPaletteCategorical46": "color-charts-palette-categorical-46",
    "colorChartsPaletteCategorical47": "color-charts-palette-categorical-47",
    "colorChartsPaletteCategorical48": "color-charts-palette-categorical-48",
    "colorChartsPaletteCategorical49": "color-charts-palette-categorical-49",
    "colorChartsPaletteCategorical50": "color-charts-palette-categorical-50",
    "colorSeverityDarkRed": "color-severity-dark-red",
    "colorSeverityRed": "color-severity-red",
    "colorSeverityOrange": "color-severity-orange",
    "colorSeverityYellow": "color-severity-yellow",
    "colorSeverityGrey": "color-severity-grey",
    "colorBackgroundNotificationSeverityCritical": "color-background-notification-severity-critical",
    "colorBackgroundNotificationSeverityHigh": "color-background-notification-severity-high",
    "colorBackgroundNotificationSeverityMedium": "color-background-notification-severity-medium",
    "colorBackgroundNotificationSeverityLow": "color-background-notification-severity-low",
    "colorBackgroundNotificationSeverityNeutral": "color-background-notification-severity-neutral",
    "colorTextNotificationSeverityCritical": "color-text-notification-severity-critical",
    "colorTextNotificationSeverityHigh": "color-text-notification-severity-high",
    "colorTextNotificationSeverityMedium": "color-text-notification-severity-medium",
    "colorTextNotificationSeverityLow": "color-text-notification-severity-low",
    "colorTextNotificationSeverityNeutral": "color-text-notification-severity-neutral",
    "colorGreyOpaque10": "color-grey-opaque-10",
    "colorGreyOpaque25": "color-grey-opaque-25",
    "colorGreyOpaque40": "color-grey-opaque-40",
    "colorGreyOpaque50": "color-grey-opaque-50",
    "colorGreyOpaque70": "color-grey-opaque-70",
    "colorGreyOpaque80": "color-grey-opaque-80",
    "colorGreyOpaque90": "color-grey-opaque-90",
    "colorGreyTransparent": "color-grey-transparent",
    "colorGreyTransparentHeavy": "color-grey-transparent-heavy",
    "colorGreyTransparentLight": "color-grey-transparent-light",
    "colorBackgroundBadgeIcon": "color-background-badge-icon",
    "colorBackgroundButtonLinkActive": "color-background-button-link-active",
    "colorBackgroundButtonLinkHover": "color-background-button-link-hover",
    "colorBackgroundButtonNormalActive": "color-background-button-normal-active",
    "colorBackgroundButtonNormalDefault": "color-background-button-normal-default",
    "colorBackgroundButtonNormalDisabled": "color-background-button-normal-disabled",
    "colorBackgroundButtonNormalHover": "color-background-button-normal-hover",
    "colorBackgroundToggleButtonNormalPressed": "color-background-toggle-button-normal-pressed",
    "colorBackgroundButtonPrimaryActive": "color-background-button-primary-active",
    "colorBackgroundButtonPrimaryDefault": "color-background-button-primary-default",
    "colorBackgroundButtonPrimaryDisabled": "color-background-button-primary-disabled",
    "colorBackgroundButtonPrimaryHover": "color-background-button-primary-hover",
    "colorBackgroundCalendarCurrentDate": "color-background-calendar-current-date",
    "colorBackgroundCellShaded": "color-background-cell-shaded",
    "colorBackgroundCodeEditorGutterActiveLineDefault": "color-background-code-editor-gutter-active-line-default",
    "colorBackgroundCodeEditorGutterActiveLineError": "color-background-code-editor-gutter-active-line-error",
    "colorBackgroundCodeEditorGutterDefault": "color-background-code-editor-gutter-default",
    "colorBackgroundCodeEditorLoading": "color-background-code-editor-loading",
    "colorBackgroundCodeEditorPaneItemHover": "color-background-code-editor-pane-item-hover",
    "colorBackgroundCodeEditorStatusBar": "color-background-code-editor-status-bar",
    "colorBackgroundContainerContent": "color-background-container-content",
    "colorBackgroundContainerHeader": "color-background-container-header",
    "colorBackgroundControlChecked": "color-background-control-checked",
    "colorBackgroundControlDefault": "color-background-control-default",
    "colorBackgroundControlDisabled": "color-background-control-disabled",
    "colorBackgroundDropdownItemDefault": "color-background-dropdown-item-default",
    "colorBackgroundDropdownItemDimmed": "color-background-dropdown-item-dimmed",
    "colorBackgroundDropdownItemFilterMatch": "color-background-dropdown-item-filter-match",
    "colorBackgroundDropdownItemHover": "color-background-dropdown-item-hover",
    "colorBackgroundDropdownItemSelected": "color-background-dropdown-item-selected",
    "colorBackgroundHomeHeader": "color-background-home-header",
    "colorBackgroundInputDefault": "color-background-input-default",
    "colorBackgroundInputDisabled": "color-background-input-disabled",
    "colorBackgroundItemSelected": "color-background-item-selected",
    "colorBackgroundLayoutMain": "color-background-layout-main",
    "colorBackgroundLayoutMobilePanel": "color-background-layout-mobile-panel",
    "colorBackgroundLayoutPanelContent": "color-background-layout-panel-content",
    "colorBackgroundLayoutPanelHover": "color-background-layout-panel-hover",
    "colorBackgroundLayoutToggleActive": "color-background-layout-toggle-active",
    "colorBackgroundLayoutToggleDefault": "color-background-layout-toggle-default",
    "colorBackgroundLayoutToggleHover": "color-background-layout-toggle-hover",
    "colorBackgroundLayoutToggleSelectedActive": "color-background-layout-toggle-selected-active",
    "colorBackgroundLayoutToggleSelectedDefault": "color-background-layout-toggle-selected-default",
    "colorBackgroundLayoutToggleSelectedHover": "color-background-layout-toggle-selected-hover",
    "colorBackgroundModalOverlay": "color-background-modal-overlay",
    "colorBackgroundNotificationBlue": "color-background-notification-blue",
    "colorBackgroundNotificationGreen": "color-background-notification-green",
    "colorBackgroundNotificationGrey": "color-background-notification-grey",
    "colorBackgroundNotificationRed": "color-background-notification-red",
    "colorBackgroundNotificationYellow": "color-background-notification-yellow",
    "colorBackgroundNotificationStackBar": "color-background-notification-stack-bar",
    "colorBackgroundNotificationStackBarActive": "color-background-notification-stack-bar-active",
    "colorBackgroundNotificationStackBarHover": "color-background-notification-stack-bar-hover",
    "colorBackgroundPopover": "color-background-popover",
    "colorBackgroundProgressBarContentDefault": "color-background-progress-bar-content-default",
    "colorBackgroundProgressBarContentInFlash": "color-background-progress-bar-content-in-flash",
    "colorBackgroundProgressBarLayoutDefault": "color-background-progress-bar-layout-default",
    "colorBackgroundProgressBarLayoutInFlash": "color-background-progress-bar-layout-in-flash",
    "colorBackgroundSegmentActive": "color-background-segment-active",
    "colorBackgroundSegmentDefault": "color-background-segment-default",
    "colorBackgroundSegmentDisabled": "color-background-segment-disabled",
    "colorBackgroundSegmentHover": "color-background-segment-hover",
    "colorBackgroundSliderHandleDefault": "color-background-slider-handle-default",
    "colorBackgroundSliderHandleActive": "color-background-slider-handle-active",
    "colorBackgroundSliderTrack": "color-background-slider-track",
    "colorBackgroundSliderHandleRing": "color-background-slider-handle-ring",
    "colorBackgroundSliderErrorPressed": "color-background-slider-error-pressed",
    "colorBackgroundSliderWarningPressed": "color-background-slider-warning-pressed",
    "colorBackgroundStatusError": "color-background-status-error",
    "colorBackgroundStatusInfo": "color-background-status-info",
    "colorBackgroundStatusSuccess": "color-background-status-success",
    "colorBackgroundStatusWarning": "color-background-status-warning",
    "colorBackgroundTableHeader": "color-background-table-header",
    "colorBackgroundTilesDisabled": "color-background-tiles-disabled",
    "colorBackgroundToggleCheckedDisabled": "color-background-toggle-checked-disabled",
    "colorBackgroundToggleDefault": "color-background-toggle-default",
    "colorBackgroundAvatarGenAi": "color-background-avatar-gen-ai",
    "colorBackgroundAvatarDefault": "color-background-avatar-default",
    "colorTextAvatar": "color-text-avatar",
    "colorBackgroundLoadingBarGenAi": "color-background-loading-bar-gen-ai",
    "colorBackgroundChatBubbleOutgoing": "color-background-chat-bubble-outgoing",
    "colorBackgroundChatBubbleIncoming": "color-background-chat-bubble-incoming",
    "colorTextChatBubbleOutgoing": "color-text-chat-bubble-outgoing",
    "colorTextChatBubbleIncoming": "color-text-chat-bubble-incoming",
    "colorBorderButtonNormalActive": "color-border-button-normal-active",
    "colorBorderButtonNormalDefault": "color-border-button-normal-default",
    "colorBorderToggleButtonNormalPressed": "color-border-toggle-button-normal-pressed",
    "colorBorderButtonNormalDisabled": "color-border-button-normal-disabled",
    "colorTextButtonNormalDisabled": "color-text-button-normal-disabled",
    "colorBorderButtonNormalHover": "color-border-button-normal-hover",
    "colorBorderButtonPrimaryDisabled": "color-border-button-primary-disabled",
    "colorTextButtonPrimaryDisabled": "color-text-button-primary-disabled",
    "colorBorderCalendarGrid": "color-border-calendar-grid",
    "colorBorderCalendarGridSelectedFocusRing": "color-border-calendar-grid-selected-focus-ring",
    "colorBorderCodeEditorAceActiveLineLightTheme": "color-border-code-editor-ace-active-line-light-theme",
    "colorBorderCodeEditorAceActiveLineDarkTheme": "color-border-code-editor-ace-active-line-dark-theme",
    "colorBorderCodeEditorDefault": "color-border-code-editor-default",
    "colorBorderCodeEditorPaneItemHover": "color-border-code-editor-pane-item-hover",
    "colorBorderContainerDivider": "color-border-container-divider",
    "colorBorderContainerTop": "color-border-container-top",
    "colorBorderControlChecked": "color-border-control-checked",
    "colorBorderControlDefault": "color-border-control-default",
    "colorBorderControlDisabled": "color-border-control-disabled",
    "colorBorderDividerActive": "color-border-divider-active",
    "colorBorderDividerDefault": "color-border-divider-default",
    "colorBorderDividerPanelBottom": "color-border-divider-panel-bottom",
    "colorBorderDividerPanelSide": "color-border-divider-panel-side",
    "colorBorderDividerSecondary": "color-border-divider-secondary",
    "colorBorderDropdownContainer": "color-border-dropdown-container",
    "colorBorderDropdownGroup": "color-border-dropdown-group",
    "colorBorderDropdownItemDefault": "color-border-dropdown-item-default",
    "colorBorderDropdownItemHover": "color-border-dropdown-item-hover",
    "colorBorderDropdownItemDimmedHover": "color-border-dropdown-item-dimmed-hover",
    "colorBorderDropdownItemSelected": "color-border-dropdown-item-selected",
    "colorBorderDropdownItemTop": "color-border-dropdown-item-top",
    "colorBorderEditableCellHover": "color-border-editable-cell-hover",
    "colorBorderInputDefault": "color-border-input-default",
    "colorBorderInputDisabled": "color-border-input-disabled",
    "colorBorderInputFocused": "color-border-input-focused",
    "colorBorderItemFocused": "color-border-item-focused",
    "colorBorderDropdownItemFocused": "color-border-dropdown-item-focused",
    "colorBorderItemPlaceholder": "color-border-item-placeholder",
    "colorBorderItemSelected": "color-border-item-selected",
    "colorBorderLayout": "color-border-layout",
    "colorBorderNotificationStackBar": "color-border-notification-stack-bar",
    "colorBorderPanelHeader": "color-border-panel-header",
    "colorBorderPopover": "color-border-popover",
    "colorBorderSegmentActive": "color-border-segment-active",
    "colorBorderSegmentDefault": "color-border-segment-default",
    "colorBorderSegmentDisabled": "color-border-segment-disabled",
    "colorBorderSegmentHover": "color-border-segment-hover",
    "colorBorderStatusError": "color-border-status-error",
    "colorBorderStatusInfo": "color-border-status-info",
    "colorBorderStatusSuccess": "color-border-status-success",
    "colorBorderStatusWarning": "color-border-status-warning",
    "colorBorderDividerInteractiveDefault": "color-border-divider-interactive-default",
    "colorBorderTabsDivider": "color-border-tabs-divider",
    "colorBorderTabsShadow": "color-border-tabs-shadow",
    "colorBorderTabsUnderline": "color-border-tabs-underline",
    "colorBorderTilesDisabled": "color-border-tiles-disabled",
    "colorBorderTutorial": "color-border-tutorial",
    "colorForegroundControlDefault": "color-foreground-control-default",
    "colorForegroundControlDisabled": "color-foreground-control-disabled",
    "colorForegroundControlReadOnly": "color-foreground-control-read-only",
    "colorShadowDefault": "color-shadow-default",
    "colorShadowMedium": "color-shadow-medium",
    "colorShadowSide": "color-shadow-side",
    "colorStrokeChartLine": "color-stroke-chart-line",
    "colorStrokeCodeEditorResizeHandler": "color-stroke-code-editor-resize-handler",
    "colorStrokeCodeEditorGutterActiveLineDefault": "color-stroke-code-editor-gutter-active-line-default",
    "colorStrokeCodeEditorGutterActiveLineHover": "color-stroke-code-editor-gutter-active-line-hover",
    "colorTextAccent": "color-text-accent",
    "colorTextBodyDefault": "color-text-body-default",
    "colorTextBodySecondary": "color-text-body-secondary",
    "colorTextBreadcrumbCurrent": "color-text-breadcrumb-current",
    "colorTextBreadcrumbIcon": "color-text-breadcrumb-icon",
    "colorTextButtonInlineIconDefault": "color-text-button-inline-icon-default",
    "colorTextButtonInlineIconDisabled": "color-text-button-inline-icon-disabled",
    "colorTextButtonInlineIconHover": "color-text-button-inline-icon-hover",
    "colorTextButtonNormalActive": "color-text-button-normal-active",
    "colorTextToggleButtonNormalPressed": "color-text-toggle-button-normal-pressed",
    "colorTextButtonNormalDefault": "color-text-button-normal-default",
    "colorTextButtonNormalHover": "color-text-button-normal-hover",
    "colorTextLinkButtonNormalDefault": "color-text-link-button-normal-default",
    "colorTextLinkButtonNormalHover": "color-text-link-button-normal-hover",
    "colorTextLinkButtonNormalActive": "color-text-link-button-normal-active",
    "colorTextButtonPrimaryActive": "color-text-button-primary-active",
    "colorTextButtonPrimaryDefault": "color-text-button-primary-default",
    "colorTextButtonPrimaryHover": "color-text-button-primary-hover",
    "colorTextCalendarDateHover": "color-text-calendar-date-hover",
    "colorTextCalendarDateSelected": "color-text-calendar-date-selected",
    "colorTextCalendarMonth": "color-text-calendar-month",
    "colorTextCodeEditorGutterActiveLine": "color-text-code-editor-gutter-active-line",
    "colorTextCodeEditorGutterDefault": "color-text-code-editor-gutter-default",
    "colorTextCodeEditorStatusBarDisabled": "color-text-code-editor-status-bar-disabled",
    "colorTextCodeEditorTabButtonError": "color-text-code-editor-tab-button-error",
    "colorTextColumnHeader": "color-text-column-header",
    "colorTextColumnSortingIcon": "color-text-column-sorting-icon",
    "colorTextControlDisabled": "color-text-control-disabled",
    "colorTextCounter": "color-text-counter",
    "colorTextDisabled": "color-text-disabled",
    "colorTextDisabledInlineEdit": "color-text-disabled-inline-edit",
    "colorTextDropdownFooter": "color-text-dropdown-footer",
    "colorTextDropdownGroupLabel": "color-text-dropdown-group-label",
    "colorTextDropdownItemDefault": "color-text-dropdown-item-default",
    "colorTextDropdownItemDimmed": "color-text-dropdown-item-dimmed",
    "colorTextDropdownItemDisabled": "color-text-dropdown-item-disabled",
    "colorTextDropdownItemFilterMatch": "color-text-dropdown-item-filter-match",
    "colorTextDropdownItemHighlighted": "color-text-dropdown-item-highlighted",
    "colorTextDropdownItemSecondary": "color-text-dropdown-item-secondary",
    "colorTextDropdownItemSecondaryHover": "color-text-dropdown-item-secondary-hover",
    "colorTextEmpty": "color-text-empty",
    "colorTextExpandableSectionDefault": "color-text-expandable-section-default",
    "colorTextExpandableSectionHover": "color-text-expandable-section-hover",
    "colorTextExpandableSectionNavigationIconDefault": "color-text-expandable-section-navigation-icon-default",
    "colorTextFormDefault": "color-text-form-default",
    "colorTextFormLabel": "color-text-form-label",
    "colorTextFormSecondary": "color-text-form-secondary",
    "colorTextGroupLabel": "color-text-group-label",
    "colorTextLabelGenAi": "color-text-label-gen-ai",
    "colorTextHeadingDefault": "color-text-heading-default",
    "colorTextHeadingSecondary": "color-text-heading-secondary",
    "colorTextHomeHeaderDefault": "color-text-home-header-default",
    "colorTextHomeHeaderSecondary": "color-text-home-header-secondary",
    "colorTextIconCaret": "color-text-icon-caret",
    "colorTextIconSubtle": "color-text-icon-subtle",
    "colorTextInputDisabled": "color-text-input-disabled",
    "colorTextInputPlaceholder": "color-text-input-placeholder",
    "colorTextInputPlaceholderDisabled": "color-text-input-placeholder-disabled",
    "colorTextInteractiveActive": "color-text-interactive-active",
    "colorTextInteractiveDefault": "color-text-interactive-default",
    "colorTextInteractiveDisabled": "color-text-interactive-disabled",
    "colorTextInteractiveHover": "color-text-interactive-hover",
    "colorTextToggleButtonIconPressed": "color-text-toggle-button-icon-pressed",
    "colorTextInteractiveInvertedDefault": "color-text-interactive-inverted-default",
    "colorTextInteractiveInvertedHover": "color-text-interactive-inverted-hover",
    "colorTextInverted": "color-text-inverted",
    "colorTextLabel": "color-text-label",
    "colorTextLayoutToggle": "color-text-layout-toggle",
    "colorTextLayoutToggleActive": "color-text-layout-toggle-active",
    "colorTextLayoutToggleHover": "color-text-layout-toggle-hover",
    "colorTextLayoutToggleSelected": "color-text-layout-toggle-selected",
    "colorTextLinkDefault": "color-text-link-default",
    "colorTextLinkHover": "color-text-link-hover",
    "colorTextLinkInvertedHover": "color-text-link-inverted-hover",
    "colorTextLinkButtonUnderline": "color-text-link-button-underline",
    "colorTextLinkButtonUnderlineHover": "color-text-link-button-underline-hover",
    "colorTextNotificationDefault": "color-text-notification-default",
    "colorTextNotificationStackBar": "color-text-notification-stack-bar",
    "colorTextNotificationYellow": "color-text-notification-yellow",
    "colorTextPaginationPageNumberActiveDisabled": "color-text-pagination-page-number-active-disabled",
    "colorTextPaginationPageNumberDefault": "color-text-pagination-page-number-default",
    "colorTextSegmentActive": "color-text-segment-active",
    "colorTextSegmentDefault": "color-text-segment-default",
    "colorTextSegmentHover": "color-text-segment-hover",
    "colorTextSmall": "color-text-small",
    "colorTextStatusError": "color-text-status-error",
    "colorTextStatusInactive": "color-text-status-inactive",
    "colorTextStatusInfo": "color-text-status-info",
    "colorTextStatusSuccess": "color-text-status-success",
    "colorTextStatusWarning": "color-text-status-warning",
    "colorTextTopNavigationTitle": "color-text-top-navigation-title",
    "colorBoardPlaceholderActive": "color-board-placeholder-active",
    "colorBoardPlaceholderHover": "color-board-placeholder-hover",
    "colorDragPlaceholderActive": "color-drag-placeholder-active",
    "colorDragPlaceholderHover": "color-drag-placeholder-hover",
    "colorDropzoneBackgroundDefault": "color-dropzone-background-default",
    "colorDropzoneBackgroundHover": "color-dropzone-background-hover",
    "colorDropzoneTextDefault": "color-dropzone-text-default",
    "colorDropzoneTextHover": "color-dropzone-text-hover",
    "colorDropzoneBorderDefault": "color-dropzone-border-default",
    "colorDropzoneBorderHover": "color-dropzone-border-hover",
    "fontBoxValueLargeWeight": "font-box-value-large-weight",
    "fontButtonLetterSpacing": "font-button-letter-spacing",
    "fontChartDetailSize": "font-chart-detail-size",
    "fontDisplayLabelWeight": "font-display-label-weight",
    "fontExpandableHeadingSize": "font-expandable-heading-size",
    "fontFamilyBase": "font-family-base",
    "fontFamilyMonospace": "font-family-monospace",
    "fontHeaderH2DescriptionLineHeight": "font-header-h2-description-line-height",
    "fontHeaderH2DescriptionSize": "font-header-h2-description-size",
    "fontLinkButtonLetterSpacing": "font-link-button-letter-spacing",
    "fontLinkButtonWeight": "font-link-button-weight",
    "fontPanelHeaderLineHeight": "font-panel-header-line-height",
    "fontPanelHeaderSize": "font-panel-header-size",
    "fontSizeBodyM": "font-size-body-m",
    "fontSizeBodyS": "font-size-body-s",
    "fontSizeDisplayL": "font-size-display-l",
    "fontSizeHeadingXl": "font-size-heading-xl",
    "fontSizeHeadingL": "font-size-heading-l",
    "fontSizeHeadingM": "font-size-heading-m",
    "fontSizeHeadingS": "font-size-heading-s",
    "fontSizeHeadingXs": "font-size-heading-xs",
    "fontSmoothingMozOsx": "font-smoothing-moz-osx",
    "fontSmoothingWebkit": "font-smoothing-webkit",
    "fontTabsDisabledWeight": "font-tabs-disabled-weight",
    "fontTabsLineHeight": "font-tabs-line-height",
    "fontTabsSize": "font-tabs-size",
    "fontWayfindingLinkActiveWeight": "font-wayfinding-link-active-weight",
    "fontWeightButton": "font-weight-button",
    "fontWeightHeadingXl": "font-weight-heading-xl",
    "fontWeightHeadingL": "font-weight-heading-l",
    "fontWeightHeadingM": "font-weight-heading-m",
    "fontWeightHeadingS": "font-weight-heading-s",
    "fontWeightHeadingXs": "font-weight-heading-xs",
    "fontWeightHeavy": "font-weight-heavy",
    "letterSpacingBodyS": "letter-spacing-body-s",
    "letterSpacingDisplayL": "letter-spacing-display-l",
    "letterSpacingHeadingXl": "letter-spacing-heading-xl",
    "letterSpacingHeadingL": "letter-spacing-heading-l",
    "letterSpacingHeadingM": "letter-spacing-heading-m",
    "letterSpacingHeadingS": "letter-spacing-heading-s",
    "lineHeightBodyM": "line-height-body-m",
    "lineHeightBodyS": "line-height-body-s",
    "lineHeightDisplayL": "line-height-display-l",
    "lineHeightHeadingXl": "line-height-heading-xl",
    "lineHeightHeadingL": "line-height-heading-l",
    "lineHeightHeadingM": "line-height-heading-m",
    "lineHeightHeadingS": "line-height-heading-s",
    "lineHeightHeadingXs": "line-height-heading-xs",
    "borderActiveWidth": "border-active-width",
    "borderCodeEditorStatusDividerWidth": "border-code-editor-status-divider-width",
    "borderContainerStickyWidth": "border-container-sticky-width",
    "borderContainerTopWidth": "border-container-top-width",
    "borderControlFocusRingShadowSpread": "border-control-focus-ring-shadow-spread",
    "borderControlInvalidFocusRingShadowSpread": "border-control-invalid-focus-ring-shadow-spread",
    "borderDividerListWidth": "border-divider-list-width",
    "borderDividerSectionWidth": "border-divider-section-width",
    "borderDropdownVirtualOffsetWidth": "border-dropdown-virtual-offset-width",
    "borderInvalidWidth": "border-invalid-width",
    "borderItemWidth": "border-item-width",
    "borderLineChartDashArray": "border-line-chart-dash-array",
    "borderLineChartLineJoin": "border-line-chart-line-join",
    "borderLineChartWidth": "border-line-chart-width",
    "borderPanelHeaderWidth": "border-panel-header-width",
    "borderPanelTopWidth": "border-panel-top-width",
    "borderRadiusAlert": "border-radius-alert",
    "borderRadiusBadge": "border-radius-badge",
    "borderRadiusButton": "border-radius-button",
    "borderRadiusCalendarDayFocusRing": "border-radius-calendar-day-focus-ring",
    "borderRadiusCodeEditor": "border-radius-code-editor",
    "borderRadiusContainer": "border-radius-container",
    "borderRadiusControlCircularFocusRing": "border-radius-control-circular-focus-ring",
    "borderRadiusControlDefaultFocusRing": "border-radius-control-default-focus-ring",
    "borderRadiusDropdown": "border-radius-dropdown",
    "borderRadiusDropzone": "border-radius-dropzone",
    "borderRadiusFlashbar": "border-radius-flashbar",
    "borderRadiusItem": "border-radius-item",
    "borderRadiusInput": "border-radius-input",
    "borderRadiusPopover": "border-radius-popover",
    "borderRadiusTabsFocusRing": "border-radius-tabs-focus-ring",
    "borderRadiusTiles": "border-radius-tiles",
    "borderRadiusToken": "border-radius-token",
    "borderRadiusChatBubble": "border-radius-chat-bubble",
    "borderRadiusTutorialPanelItem": "border-radius-tutorial-panel-item",
    "borderTableStickyWidth": "border-table-sticky-width",
    "borderLinkFocusRingOutline": "border-link-focus-ring-outline",
    "borderLinkFocusRingShadowSpread": "border-link-focus-ring-shadow-spread",
    "borderWidthAlert": "border-width-alert",
    "borderWidthField": "border-width-field",
    "borderWidthPopover": "border-width-popover",
    "motionDurationExtraFast": "motion-duration-extra-fast",
    "motionDurationExtraSlow": "motion-duration-extra-slow",
    "motionDurationFast": "motion-duration-fast",
    "motionDurationModerate": "motion-duration-moderate",
    "motionDurationRefreshOnlyAmbient": "motion-duration-refresh-only-ambient",
    "motionDurationRefreshOnlyFast": "motion-duration-refresh-only-fast",
    "motionDurationRefreshOnlyMedium": "motion-duration-refresh-only-medium",
    "motionDurationRefreshOnlySlow": "motion-duration-refresh-only-slow",
    "motionDurationAvatarGenAiGradient": "motion-duration-avatar-gen-ai-gradient",
    "motionDurationAvatarLoadingDots": "motion-duration-avatar-loading-dots",
    "motionDurationRotate180": "motion-duration-rotate-180",
    "motionDurationRotate90": "motion-duration-rotate-90",
    "motionDurationShowPaced": "motion-duration-show-paced",
    "motionDurationShowQuick": "motion-duration-show-quick",
    "motionDurationSlow": "motion-duration-slow",
    "motionDurationTransitionQuick": "motion-duration-transition-quick",
    "motionDurationTransitionShowPaced": "motion-duration-transition-show-paced",
    "motionDurationTransitionShowQuick": "motion-duration-transition-show-quick",
    "motionEasingEaseOutQuart": "motion-easing-ease-out-quart",
    "motionEasingRefreshOnlyA": "motion-easing-refresh-only-a",
    "motionEasingRefreshOnlyB": "motion-easing-refresh-only-b",
    "motionEasingRefreshOnlyC": "motion-easing-refresh-only-c",
    "motionEasingRefreshOnlyD": "motion-easing-refresh-only-d",
    "motionEasingAvatarGenAiGradient": "motion-easing-avatar-gen-ai-gradient",
    "motionEasingRotate180": "motion-easing-rotate-180",
    "motionEasingRotate90": "motion-easing-rotate-90",
    "motionEasingShowPaced": "motion-easing-show-paced",
    "motionEasingShowQuick": "motion-easing-show-quick",
    "motionEasingTransitionQuick": "motion-easing-transition-quick",
    "motionEasingTransitionShowPaced": "motion-easing-transition-show-paced",
    "motionEasingTransitionShowQuick": "motion-easing-transition-show-quick",
    "motionEasingResponsive": "motion-easing-responsive",
    "motionEasingSticky": "motion-easing-sticky",
    "motionEasingExpressive": "motion-easing-expressive",
    "motionDurationResponsive": "motion-duration-responsive",
    "motionDurationExpressive": "motion-duration-expressive",
    "motionDurationComplex": "motion-duration-complex",
    "motionKeyframesFadeIn": "motion-keyframes-fade-in",
    "motionKeyframesFadeOut": "motion-keyframes-fade-out",
    "motionKeyframesStatusIconError": "motion-keyframes-status-icon-error",
    "motionKeyframesScalePopup": "motion-keyframes-scale-popup",
    "sizeCalendarGridWidth": "size-calendar-grid-width",
    "sizeControl": "size-control",
    "sizeIconBig": "size-icon-big",
    "sizeIconLarge": "size-icon-large",
    "sizeIconMedium": "size-icon-medium",
    "sizeIconNormal": "size-icon-normal",
    "sizeTableSelectionHorizontal": "size-table-selection-horizontal",
    "sizeVerticalInput": "size-vertical-input",
    "sizeVerticalPanelIconOffset": "size-vertical-panel-icon-offset",
    "spaceAlertActionLeft": "space-alert-action-left",
    "spaceAlertHorizontal": "space-alert-horizontal",
    "spaceAlertMessageRight": "space-alert-message-right",
    "spaceAlertVertical": "space-alert-vertical",
    "spaceButtonFocusOutlineGutter": "space-button-focus-outline-gutter",
    "spaceButtonHorizontal": "space-button-horizontal",
    "spaceButtonIconFocusOutlineGutterVertical": "space-button-icon-focus-outline-gutter-vertical",
    "spaceButtonIconOnlyHorizontal": "space-button-icon-only-horizontal",
    "spaceButtonInlineIconFocusOutlineGutter": "space-button-inline-icon-focus-outline-gutter",
    "spaceButtonModalDismissVertical": "space-button-modal-dismiss-vertical",
    "spaceCalendarGridFocusOutlineGutter": "space-calendar-grid-focus-outline-gutter",
    "spaceCalendarGridSelectedFocusOutlineGutter": "space-calendar-grid-selected-focus-outline-gutter",
    "spaceCalendarGridGutter": "space-calendar-grid-gutter",
    "spaceCardHorizontal": "space-card-horizontal",
    "spaceCardVertical": "space-card-vertical",
    "spaceCodeEditorStatusFocusOutlineGutter": "space-code-editor-status-focus-outline-gutter",
    "spaceContainerContentTop": "space-container-content-top",
    "spaceContainerHeaderTop": "space-container-header-top",
    "spaceContainerHeaderBottom": "space-container-header-bottom",
    "spaceContainerHorizontal": "space-container-horizontal",
    "spaceContentHeaderPaddingBottom": "space-content-header-padding-bottom",
    "spaceDarkHeaderOverlapDistance": "space-dark-header-overlap-distance",
    "spaceExpandableSectionIconOffsetTop": "space-expandable-section-icon-offset-top",
    "spaceFieldHorizontal": "space-field-horizontal",
    "spaceFieldIconOffset": "space-field-icon-offset",
    "spaceFilteringTokenDismissButtonFocusOutlineGutter": "space-filtering-token-dismiss-button-focus-outline-gutter",
    "spaceFilteringTokenOperationSelectFocusOutlineGutter": "space-filtering-token-operation-select-focus-outline-gutter",
    "spaceFlashbarActionLeft": "space-flashbar-action-left",
    "spaceFlashbarDismissRight": "space-flashbar-dismiss-right",
    "spaceFlashbarHorizontal": "space-flashbar-horizontal",
    "spaceGridGutter": "space-grid-gutter",
    "spaceKeyValueGap": "space-key-value-gap",
    "spaceLayoutContentBottom": "space-layout-content-bottom",
    "spaceLayoutContentHorizontal": "space-layout-content-horizontal",
    "spaceLayoutToggleDiameter": "space-layout-toggle-diameter",
    "spaceLayoutTogglePadding": "space-layout-toggle-padding",
    "spaceModalContentBottom": "space-modal-content-bottom",
    "spaceModalHorizontal": "space-modal-horizontal",
    "spaceOptionIconBigTop": "space-option-icon-big-top",
    "spacePanelContentBottom": "space-panel-content-bottom",
    "spacePanelContentTop": "space-panel-content-top",
    "spacePanelDividerMarginHorizontal": "space-panel-divider-margin-horizontal",
    "spacePanelHeaderVertical": "space-panel-header-vertical",
    "spacePanelNavLeft": "space-panel-nav-left",
    "spacePanelSideLeft": "space-panel-side-left",
    "spacePanelSideRight": "space-panel-side-right",
    "spacePanelSplitTop": "space-panel-split-top",
    "spacePanelSplitBottom": "space-panel-split-bottom",
    "spaceSegmentedControlFocusOutlineGutter": "space-segmented-control-focus-outline-gutter",
    "spaceTabsContentTop": "space-tabs-content-top",
    "spaceTabsFocusOutlineGutter": "space-tabs-focus-outline-gutter",
    "spaceTableContentBottom": "space-table-content-bottom",
    "spaceTableEmbeddedHeaderTop": "space-table-embedded-header-top",
    "spaceTableFooterHorizontal": "space-table-footer-horizontal",
    "spaceTableHeaderFocusOutlineGutter": "space-table-header-focus-outline-gutter",
    "spaceTableHeaderHorizontal": "space-table-header-horizontal",
    "spaceTableHeaderToolsBottom": "space-table-header-tools-bottom",
    "spaceTableHeaderToolsFullPageBottom": "space-table-header-tools-full-page-bottom",
    "spaceTableHorizontal": "space-table-horizontal",
    "spaceTileGutter": "space-tile-gutter",
    "spaceScaled2xNone": "space-scaled-2x-none",
    "spaceScaled2xXxxs": "space-scaled-2x-xxxs",
    "spaceScaled2xXxs": "space-scaled-2x-xxs",
    "spaceScaled2xXs": "space-scaled-2x-xs",
    "spaceScaled2xS": "space-scaled-2x-s",
    "spaceScaled2xM": "space-scaled-2x-m",
    "spaceScaled2xL": "space-scaled-2x-l",
    "spaceScaled2xXl": "space-scaled-2x-xl",
    "spaceScaled2xXxl": "space-scaled-2x-xxl",
    "spaceScaled2xXxxl": "space-scaled-2x-xxxl",
    "spaceScaledNone": "space-scaled-none",
    "spaceScaledXxxs": "space-scaled-xxxs",
    "spaceScaledXxs": "space-scaled-xxs",
    "spaceScaledXs": "space-scaled-xs",
    "spaceScaledS": "space-scaled-s",
    "spaceScaledM": "space-scaled-m",
    "spaceScaledL": "space-scaled-l",
    "spaceScaledXl": "space-scaled-xl",
    "spaceScaledXxl": "space-scaled-xxl",
    "spaceScaledXxxl": "space-scaled-xxxl",
    "spaceStaticXxxs": "space-static-xxxs",
    "spaceStaticXxs": "space-static-xxs",
    "spaceStaticXs": "space-static-xs",
    "spaceStaticS": "space-static-s",
    "spaceStaticM": "space-static-m",
    "spaceStaticL": "space-static-l",
    "spaceStaticXl": "space-static-xl",
    "spaceStaticXxl": "space-static-xxl",
    "spaceStaticXxxl": "space-static-xxxl",
    "spaceNone": "space-none",
    "spaceXxxs": "space-xxxs",
    "spaceXxs": "space-xxs",
    "spaceXs": "space-xs",
    "spaceS": "space-s",
    "spaceM": "space-m",
    "spaceL": "space-l",
    "spaceXl": "space-xl",
    "spaceXxl": "space-xxl",
    "spaceXxxl": "space-xxxl",
    "shadowContainer": "shadow-container",
    "shadowContainerStacked": "shadow-container-stacked",
    "shadowContainerActive": "shadow-container-active",
    "shadowDropdown": "shadow-dropdown",
    "shadowDropup": "shadow-dropup",
    "shadowFlashCollapsed": "shadow-flash-collapsed",
    "shadowFlashSticky": "shadow-flash-sticky",
    "shadowModal": "shadow-modal",
    "shadowPanel": "shadow-panel",
    "shadowPanelToggle": "shadow-panel-toggle",
    "shadowPopover": "shadow-popover",
    "shadowSplitBottom": "shadow-split-bottom",
    "shadowSplitSide": "shadow-split-side",
    "shadowSticky": "shadow-sticky",
    "shadowStickyEmbedded": "shadow-sticky-embedded",
    "shadowStickyColumnFirst": "shadow-sticky-column-first",
    "shadowStickyColumnLast": "shadow-sticky-column-last"
  },
  "propertiesMap": {
    "colorAmazonOrange": "--color-amazon-orange-gsvdv7",
    "colorAwsSquidInk": "--color-aws-squid-ink-uuesmr",
    "colorBlack": "--color-black-q5so4f",
    "colorBlue100": "--color-blue-100-wlcs2n",
    "colorBlue200": "--color-blue-200-sd5adl",
    "colorBlue300": "--color-blue-300-5k8cbj",
    "colorBlue400": "--color-blue-400-946rwg",
    "colorBlue500": "--color-blue-500-5xgaz7",
    "colorBlue600": "--color-blue-600-reb9vf",
    "colorBlue700": "--color-blue-700-v3a2es",
    "colorBlue800": "--color-blue-800-5d4pjk",
    "colorBlue900": "--color-blue-900-z611ct",
    "colorBlueOpaque": "--color-blue-opaque-gzkvwf",
    "colorGreen100": "--color-green-100-krlue2",
    "colorGreen500": "--color-green-500-ce8frt",
    "colorGreen600": "--color-green-600-5989fd",
    "colorGreen700": "--color-green-700-b7c0jd",
    "colorGreen900": "--color-green-900-23ye01",
    "colorGrey100": "--color-grey-100-v3ezs2",
    "colorGrey125": "--color-grey-125-eoue5v",
    "colorGrey150": "--color-grey-150-0aamhe",
    "colorGrey200": "--color-grey-200-oj8zih",
    "colorGrey300": "--color-grey-300-hqvt1h",
    "colorGrey350": "--color-grey-350-7dh6jp",
    "colorGrey400": "--color-grey-400-65txhu",
    "colorGrey450": "--color-grey-450-dchvfk",
    "colorGrey500": "--color-grey-500-cbi6nr",
    "colorGrey550": "--color-grey-550-sy2mz4",
    "colorGrey600": "--color-grey-600-orr5wj",
    "colorGrey650": "--color-grey-650-r7rd0u",
    "colorGrey700": "--color-grey-700-2nl5fe",
    "colorGrey750": "--color-grey-750-dqp236",
    "colorGrey800": "--color-grey-800-n0zpkl",
    "colorGrey850": "--color-grey-850-wka0kd",
    "colorGrey900": "--color-grey-900-o3bf8c",
    "colorGrey950": "--color-grey-950-62cv93",
    "colorOrange100": "--color-orange-100-akgi2l",
    "colorOrange500": "--color-orange-500-dpl1nc",
    "colorOrange600": "--color-orange-600-5vsg33",
    "colorOrange700": "--color-orange-700-3igdeo",
    "colorPurple400": "--color-purple-400-wvnlma",
    "colorPurple600": "--color-purple-600-468euy",
    "colorRed100": "--color-red-100-omy75e",
    "colorRed500": "--color-red-500-281f53",
    "colorRed600": "--color-red-600-oguye6",
    "colorRed700": "--color-red-700-vpn9s6",
    "colorRed900": "--color-red-900-lsdc77",
    "colorTransparent": "--color-transparent-0ltpn5",
    "colorWhite": "--color-white-s5xhu1",
    "colorYellow100": "--color-yellow-100-gqzix7",
    "colorYellow600": "--color-yellow-600-b1opgq",
    "colorYellow700": "--color-yellow-700-vw7jd7",
    "colorYellow800": "--color-yellow-800-0kls3p",
    "colorYellow900": "--color-yellow-900-n1l6gi",
    "colorChartsRed300": "--color-charts-red-300-l64jkq",
    "colorChartsRed400": "--color-charts-red-400-wa91b2",
    "colorChartsRed500": "--color-charts-red-500-clvvu0",
    "colorChartsRed600": "--color-charts-red-600-n5f5z7",
    "colorChartsRed700": "--color-charts-red-700-9qnabz",
    "colorChartsRed800": "--color-charts-red-800-03myov",
    "colorChartsRed900": "--color-charts-red-900-t7y4st",
    "colorChartsRed1000": "--color-charts-red-1000-2569eu",
    "colorChartsRed1100": "--color-charts-red-1100-utabtk",
    "colorChartsRed1200": "--color-charts-red-1200-p41vo4",
    "colorChartsOrange300": "--color-charts-orange-300-8xdemd",
    "colorChartsOrange400": "--color-charts-orange-400-98kh01",
    "colorChartsOrange500": "--color-charts-orange-500-3exfo1",
    "colorChartsOrange600": "--color-charts-orange-600-tyzxch",
    "colorChartsOrange700": "--color-charts-orange-700-9es7jg",
    "colorChartsOrange800": "--color-charts-orange-800-zzyr3p",
    "colorChartsOrange900": "--color-charts-orange-900-ozn3mk",
    "colorChartsOrange1000": "--color-charts-orange-1000-2j9x6g",
    "colorChartsOrange1100": "--color-charts-orange-1100-gbb7zd",
    "colorChartsOrange1200": "--color-charts-orange-1200-k1a2bc",
    "colorChartsYellow300": "--color-charts-yellow-300-ud5z8m",
    "colorChartsYellow400": "--color-charts-yellow-400-er893i",
    "colorChartsYellow500": "--color-charts-yellow-500-zf6yw3",
    "colorChartsYellow600": "--color-charts-yellow-600-e1b0zr",
    "colorChartsYellow700": "--color-charts-yellow-700-3ihyrv",
    "colorChartsYellow800": "--color-charts-yellow-800-2luor7",
    "colorChartsYellow900": "--color-charts-yellow-900-k8cds4",
    "colorChartsYellow1000": "--color-charts-yellow-1000-9ibbxn",
    "colorChartsYellow1100": "--color-charts-yellow-1100-igbqae",
    "colorChartsYellow1200": "--color-charts-yellow-1200-qg1amh",
    "colorChartsGreen300": "--color-charts-green-300-gduyir",
    "colorChartsGreen400": "--color-charts-green-400-jvx3c1",
    "colorChartsGreen500": "--color-charts-green-500-uj364g",
    "colorChartsGreen600": "--color-charts-green-600-mbov5u",
    "colorChartsGreen700": "--color-charts-green-700-m7xx1p",
    "colorChartsGreen800": "--color-charts-green-800-97d577",
    "colorChartsGreen900": "--color-charts-green-900-79vtkm",
    "colorChartsGreen1000": "--color-charts-green-1000-dw0ace",
    "colorChartsGreen1100": "--color-charts-green-1100-fdxgm3",
    "colorChartsGreen1200": "--color-charts-green-1200-0w78ld",
    "colorChartsTeal300": "--color-charts-teal-300-b1amlp",
    "colorChartsTeal400": "--color-charts-teal-400-75fmn4",
    "colorChartsTeal500": "--color-charts-teal-500-5p6o7k",
    "colorChartsTeal600": "--color-charts-teal-600-1ar5in",
    "colorChartsTeal700": "--color-charts-teal-700-3m4vci",
    "colorChartsTeal800": "--color-charts-teal-800-0fx1b9",
    "colorChartsTeal900": "--color-charts-teal-900-a0x7u4",
    "colorChartsTeal1000": "--color-charts-teal-1000-n2wukj",
    "colorChartsTeal1100": "--color-charts-teal-1100-3rvzfn",
    "colorChartsTeal1200": "--color-charts-teal-1200-hfik8s",
    "colorChartsBlue1300": "--color-charts-blue-1-300-uwr1wq",
    "colorChartsBlue1400": "--color-charts-blue-1-400-y4dmzv",
    "colorChartsBlue1500": "--color-charts-blue-1-500-jj2qqx",
    "colorChartsBlue1600": "--color-charts-blue-1-600-ntcnzw",
    "colorChartsBlue1700": "--color-charts-blue-1-700-vhr7bu",
    "colorChartsBlue1800": "--color-charts-blue-1-800-zq4na2",
    "colorChartsBlue1900": "--color-charts-blue-1-900-pu28p4",
    "colorChartsBlue11000": "--color-charts-blue-1-1000-a1wpur",
    "colorChartsBlue11100": "--color-charts-blue-1-1100-fyl0u6",
    "colorChartsBlue11200": "--color-charts-blue-1-1200-y913fp",
    "colorChartsBlue2300": "--color-charts-blue-2-300-sh1kxw",
    "colorChartsBlue2400": "--color-charts-blue-2-400-s269w5",
    "colorChartsBlue2500": "--color-charts-blue-2-500-y9grom",
    "colorChartsBlue2600": "--color-charts-blue-2-600-ljsd9s",
    "colorChartsBlue2700": "--color-charts-blue-2-700-8pne2y",
    "colorChartsBlue2800": "--color-charts-blue-2-800-v3m6dn",
    "colorChartsBlue2900": "--color-charts-blue-2-900-2rg9qw",
    "colorChartsBlue21000": "--color-charts-blue-2-1000-ore46l",
    "colorChartsBlue21100": "--color-charts-blue-2-1100-rj1e0b",
    "colorChartsBlue21200": "--color-charts-blue-2-1200-i1tjtx",
    "colorChartsPurple300": "--color-charts-purple-300-egsaob",
    "colorChartsPurple400": "--color-charts-purple-400-y2qlpj",
    "colorChartsPurple500": "--color-charts-purple-500-akrt38",
    "colorChartsPurple600": "--color-charts-purple-600-dnhyx7",
    "colorChartsPurple700": "--color-charts-purple-700-sk05tr",
    "colorChartsPurple800": "--color-charts-purple-800-g5mys1",
    "colorChartsPurple900": "--color-charts-purple-900-ap3bee",
    "colorChartsPurple1000": "--color-charts-purple-1000-pymhe3",
    "colorChartsPurple1100": "--color-charts-purple-1100-f2iopl",
    "colorChartsPurple1200": "--color-charts-purple-1200-aic8dr",
    "colorChartsPink300": "--color-charts-pink-300-cctxfi",
    "colorChartsPink400": "--color-charts-pink-400-kpryka",
    "colorChartsPink500": "--color-charts-pink-500-tccj7z",
    "colorChartsPink600": "--color-charts-pink-600-4bki3e",
    "colorChartsPink700": "--color-charts-pink-700-gexeia",
    "colorChartsPink800": "--color-charts-pink-800-9fchm4",
    "colorChartsPink900": "--color-charts-pink-900-z4eeu8",
    "colorChartsPink1000": "--color-charts-pink-1000-7uou4m",
    "colorChartsPink1100": "--color-charts-pink-1100-j0uevl",
    "colorChartsPink1200": "--color-charts-pink-1200-jpnl1t",
    "colorChartsStatusCritical": "--color-charts-status-critical-vygogl",
    "colorChartsStatusHigh": "--color-charts-status-high-xmh5vl",
    "colorChartsStatusMedium": "--color-charts-status-medium-le4kdn",
    "colorChartsStatusLow": "--color-charts-status-low-seyj13",
    "colorChartsStatusPositive": "--color-charts-status-positive-g1vr65",
    "colorChartsStatusInfo": "--color-charts-status-info-10v3c7",
    "colorChartsStatusNeutral": "--color-charts-status-neutral-en4ep8",
    "colorChartsThresholdNegative": "--color-charts-threshold-negative-dj5crf",
    "colorChartsThresholdPositive": "--color-charts-threshold-positive-zo9s0l",
    "colorChartsThresholdInfo": "--color-charts-threshold-info-rgb5hd",
    "colorChartsThresholdNeutral": "--color-charts-threshold-neutral-kq30cz",
    "colorChartsLineGrid": "--color-charts-line-grid-vaxun1",
    "colorChartsLineTick": "--color-charts-line-tick-6i81s1",
    "colorChartsLineAxis": "--color-charts-line-axis-d4bcyf",
    "colorChartsPaletteCategorical1": "--color-charts-palette-categorical-1-ld9m1p",
    "colorChartsPaletteCategorical2": "--color-charts-palette-categorical-2-jwteam",
    "colorChartsPaletteCategorical3": "--color-charts-palette-categorical-3-tlwr5r",
    "colorChartsPaletteCategorical4": "--color-charts-palette-categorical-4-prlvih",
    "colorChartsPaletteCategorical5": "--color-charts-palette-categorical-5-04vsso",
    "colorChartsPaletteCategorical6": "--color-charts-palette-categorical-6-2wgmsi",
    "colorChartsPaletteCategorical7": "--color-charts-palette-categorical-7-w06irv",
    "colorChartsPaletteCategorical8": "--color-charts-palette-categorical-8-1qnvcp",
    "colorChartsPaletteCategorical9": "--color-charts-palette-categorical-9-0342zm",
    "colorChartsPaletteCategorical10": "--color-charts-palette-categorical-10-u73kns",
    "colorChartsPaletteCategorical11": "--color-charts-palette-categorical-11-tloc2a",
    "colorChartsPaletteCategorical12": "--color-charts-palette-categorical-12-23xv0d",
    "colorChartsPaletteCategorical13": "--color-charts-palette-categorical-13-tuq7ce",
    "colorChartsPaletteCategorical14": "--color-charts-palette-categorical-14-bom4ss",
    "colorChartsPaletteCategorical15": "--color-charts-palette-categorical-15-kpqcpe",
    "colorChartsPaletteCategorical16": "--color-charts-palette-categorical-16-pzlo2l",
    "colorChartsPaletteCategorical17": "--color-charts-palette-categorical-17-spn4mx",
    "colorChartsPaletteCategorical18": "--color-charts-palette-categorical-18-kxbv8i",
    "colorChartsPaletteCategorical19": "--color-charts-palette-categorical-19-cl97gf",
    "colorChartsPaletteCategorical20": "--color-charts-palette-categorical-20-gzcnb4",
    "colorChartsPaletteCategorical21": "--color-charts-palette-categorical-21-vyqcuq",
    "colorChartsPaletteCategorical22": "--color-charts-palette-categorical-22-6r7gq7",
    "colorChartsPaletteCategorical23": "--color-charts-palette-categorical-23-7c98ot",
    "colorChartsPaletteCategorical24": "--color-charts-palette-categorical-24-0i0wmq",
    "colorChartsPaletteCategorical25": "--color-charts-palette-categorical-25-7j0tso",
    "colorChartsPaletteCategorical26": "--color-charts-palette-categorical-26-eql7mt",
    "colorChartsPaletteCategorical27": "--color-charts-palette-categorical-27-8doiqc",
    "colorChartsPaletteCategorical28": "--color-charts-palette-categorical-28-tlstes",
    "colorChartsPaletteCategorical29": "--color-charts-palette-categorical-29-noa7ft",
    "colorChartsPaletteCategorical30": "--color-charts-palette-categorical-30-ttbs6s",
    "colorChartsPaletteCategorical31": "--color-charts-palette-categorical-31-lz0ukh",
    "colorChartsPaletteCategorical32": "--color-charts-palette-categorical-32-ncpn1t",
    "colorChartsPaletteCategorical33": "--color-charts-palette-categorical-33-fpbcye",
    "colorChartsPaletteCategorical34": "--color-charts-palette-categorical-34-sk46nw",
    "colorChartsPaletteCategorical35": "--color-charts-palette-categorical-35-wwtyjx",
    "colorChartsPaletteCategorical36": "--color-charts-palette-categorical-36-7v0fgy",
    "colorChartsPaletteCategorical37": "--color-charts-palette-categorical-37-b2rc0w",
    "colorChartsPaletteCategorical38": "--color-charts-palette-categorical-38-nlzlk1",
    "colorChartsPaletteCategorical39": "--color-charts-palette-categorical-39-esgczm",
    "colorChartsPaletteCategorical40": "--color-charts-palette-categorical-40-0hdln6",
    "colorChartsPaletteCategorical41": "--color-charts-palette-categorical-41-bsk8cf",
    "colorChartsPaletteCategorical42": "--color-charts-palette-categorical-42-97om84",
    "colorChartsPaletteCategorical43": "--color-charts-palette-categorical-43-euzcqg",
    "colorChartsPaletteCategorical44": "--color-charts-palette-categorical-44-a7wos6",
    "colorChartsPaletteCategorical45": "--color-charts-palette-categorical-45-iz0wz2",
    "colorChartsPaletteCategorical46": "--color-charts-palette-categorical-46-nzigym",
    "colorChartsPaletteCategorical47": "--color-charts-palette-categorical-47-croxgd",
    "colorChartsPaletteCategorical48": "--color-charts-palette-categorical-48-tptw1p",
    "colorChartsPaletteCategorical49": "--color-charts-palette-categorical-49-6lrkes",
    "colorChartsPaletteCategorical50": "--color-charts-palette-categorical-50-mqbaxr",
    "colorSeverityDarkRed": "--color-severity-dark-red-26aton",
    "colorSeverityRed": "--color-severity-red-mjb3fl",
    "colorSeverityOrange": "--color-severity-orange-3ez4cr",
    "colorSeverityYellow": "--color-severity-yellow-mn9wrz",
    "colorSeverityGrey": "--color-severity-grey-s6nlyg",
    "colorBackgroundNotificationSeverityCritical": "--color-background-notification-severity-critical-m6z340",
    "colorBackgroundNotificationSeverityHigh": "--color-background-notification-severity-high-zn7yde",
    "colorBackgroundNotificationSeverityMedium": "--color-background-notification-severity-medium-empymi",
    "colorBackgroundNotificationSeverityLow": "--color-background-notification-severity-low-jkxbp4",
    "colorBackgroundNotificationSeverityNeutral": "--color-background-notification-severity-neutral-wtuxqz",
    "colorTextNotificationSeverityCritical": "--color-text-notification-severity-critical-cmj0dk",
    "colorTextNotificationSeverityHigh": "--color-text-notification-severity-high-rgh0m2",
    "colorTextNotificationSeverityMedium": "--color-text-notification-severity-medium-9rk0hm",
    "colorTextNotificationSeverityLow": "--color-text-notification-severity-low-so8wqb",
    "colorTextNotificationSeverityNeutral": "--color-text-notification-severity-neutral-h04hdx",
    "colorGreyOpaque10": "--color-grey-opaque-10-xipm4s",
    "colorGreyOpaque25": "--color-grey-opaque-25-igqnxy",
    "colorGreyOpaque40": "--color-grey-opaque-40-wxjof3",
    "colorGreyOpaque50": "--color-grey-opaque-50-akurqr",
    "colorGreyOpaque70": "--color-grey-opaque-70-jp2m2h",
    "colorGreyOpaque80": "--color-grey-opaque-80-dkpq62",
    "colorGreyOpaque90": "--color-grey-opaque-90-vv6tpi",
    "colorGreyTransparent": "--color-grey-transparent-pgkfzu",
    "colorGreyTransparentHeavy": "--color-grey-transparent-heavy-vx6iel",
    "colorGreyTransparentLight": "--color-grey-transparent-light-qjg35b",
    "colorBackgroundBadgeIcon": "--color-background-badge-icon-n0lc3o",
    "colorBackgroundButtonLinkActive": "--color-background-button-link-active-zsvqyt",
    "colorBackgroundButtonLinkHover": "--color-background-button-link-hover-7joibg",
    "colorBackgroundButtonNormalActive": "--color-background-button-normal-active-udb472",
    "colorBackgroundButtonNormalDefault": "--color-background-button-normal-default-zr63bz",
    "colorBackgroundButtonNormalDisabled": "--color-background-button-normal-disabled-h6arvb",
    "colorBackgroundButtonNormalHover": "--color-background-button-normal-hover-eqpcl2",
    "colorBackgroundToggleButtonNormalPressed": "--color-background-toggle-button-normal-pressed-cpfehj",
    "colorBackgroundButtonPrimaryActive": "--color-background-button-primary-active-qz8503",
    "colorBackgroundButtonPrimaryDefault": "--color-background-button-primary-default-ux9d4m",
    "colorBackgroundButtonPrimaryDisabled": "--color-background-button-primary-disabled-l4i17m",
    "colorBackgroundButtonPrimaryHover": "--color-background-button-primary-hover-0qidjj",
    "colorBackgroundCalendarCurrentDate": "--color-background-calendar-current-date-a6ucrp",
    "colorBackgroundCellShaded": "--color-background-cell-shaded-sc089k",
    "colorBackgroundCodeEditorGutterActiveLineDefault": "--color-background-code-editor-gutter-active-line-default-v8is2q",
    "colorBackgroundCodeEditorGutterActiveLineError": "--color-background-code-editor-gutter-active-line-error-bd4ln4",
    "colorBackgroundCodeEditorGutterDefault": "--color-background-code-editor-gutter-default-v5e78w",
    "colorBackgroundCodeEditorLoading": "--color-background-code-editor-loading-2zupgi",
    "colorBackgroundCodeEditorPaneItemHover": "--color-background-code-editor-pane-item-hover-h04m4p",
    "colorBackgroundCodeEditorStatusBar": "--color-background-code-editor-status-bar-ybpgwu",
    "colorBackgroundContainerContent": "--color-background-container-content-z79u4u",
    "colorBackgroundContainerHeader": "--color-background-container-header-clzg6q",
    "colorBackgroundControlChecked": "--color-background-control-checked-hz4k40",
    "colorBackgroundControlDefault": "--color-background-control-default-5ol8rv",
    "colorBackgroundControlDisabled": "--color-background-control-disabled-5cbvij",
    "colorBackgroundDropdownItemDefault": "--color-background-dropdown-item-default-u8emhk",
    "colorBackgroundDropdownItemDimmed": "--color-background-dropdown-item-dimmed-dlm6wk",
    "colorBackgroundDropdownItemFilterMatch": "--color-background-dropdown-item-filter-match-5pchhq",
    "colorBackgroundDropdownItemHover": "--color-background-dropdown-item-hover-zhzc84",
    "colorBackgroundDropdownItemSelected": "--color-background-dropdown-item-selected-idfej7",
    "colorBackgroundHomeHeader": "--color-background-home-header-eungpy",
    "colorBackgroundInputDefault": "--color-background-input-default-u56ls1",
    "colorBackgroundInputDisabled": "--color-background-input-disabled-gvxsk4",
    "colorBackgroundItemSelected": "--color-background-item-selected-njak80",
    "colorBackgroundLayoutMain": "--color-background-layout-main-2jp88g",
    "colorBackgroundLayoutMobilePanel": "--color-background-layout-mobile-panel-o50s90",
    "colorBackgroundLayoutPanelContent": "--color-background-layout-panel-content-du0fbw",
    "colorBackgroundLayoutPanelHover": "--color-background-layout-panel-hover-1ftnua",
    "colorBackgroundLayoutToggleActive": "--color-background-layout-toggle-active-5x3zwa",
    "colorBackgroundLayoutToggleDefault": "--color-background-layout-toggle-default-kci9ri",
    "colorBackgroundLayoutToggleHover": "--color-background-layout-toggle-hover-72w0bh",
    "colorBackgroundLayoutToggleSelectedActive": "--color-background-layout-toggle-selected-active-tv8i8b",
    "colorBackgroundLayoutToggleSelectedDefault": "--color-background-layout-toggle-selected-default-27rnk6",
    "colorBackgroundLayoutToggleSelectedHover": "--color-background-layout-toggle-selected-hover-eh8bga",
    "colorBackgroundModalOverlay": "--color-background-modal-overlay-lal4at",
    "colorBackgroundNotificationBlue": "--color-background-notification-blue-g87klk",
    "colorBackgroundNotificationGreen": "--color-background-notification-green-7zevmb",
    "colorBackgroundNotificationGrey": "--color-background-notification-grey-jyn3j2",
    "colorBackgroundNotificationRed": "--color-background-notification-red-f0cy22",
    "colorBackgroundNotificationYellow": "--color-background-notification-yellow-4teyr2",
    "colorBackgroundNotificationStackBar": "--color-background-notification-stack-bar-fl11np",
    "colorBackgroundNotificationStackBarActive": "--color-background-notification-stack-bar-active-4ibdhd",
    "colorBackgroundNotificationStackBarHover": "--color-background-notification-stack-bar-hover-z4ly3h",
    "colorBackgroundPopover": "--color-background-popover-eqi5zi",
    "colorBackgroundProgressBarContentDefault": "--color-background-progress-bar-content-default-sn7ya6",
    "colorBackgroundProgressBarContentInFlash": "--color-background-progress-bar-content-in-flash-ikihd5",
    "colorBackgroundProgressBarLayoutDefault": "--color-background-progress-bar-layout-default-urc8t0",
    "colorBackgroundProgressBarLayoutInFlash": "--color-background-progress-bar-layout-in-flash-d3q12s",
    "colorBackgroundSegmentActive": "--color-background-segment-active-bkvyiy",
    "colorBackgroundSegmentDefault": "--color-background-segment-default-voaiuw",
    "colorBackgroundSegmentDisabled": "--color-background-segment-disabled-9tsgp1",
    "colorBackgroundSegmentHover": "--color-background-segment-hover-jbzuvp",
    "colorBackgroundSliderHandleDefault": "--color-background-slider-handle-default-94lnn1",
    "colorBackgroundSliderHandleActive": "--color-background-slider-handle-active-7w7xg0",
    "colorBackgroundSliderTrack": "--color-background-slider-track-uhckut",
    "colorBackgroundSliderHandleRing": "--color-background-slider-handle-ring-nibud6",
    "colorBackgroundSliderErrorPressed": "--color-background-slider-error-pressed-j572od",
    "colorBackgroundSliderWarningPressed": "--color-background-slider-warning-pressed-pg5aih",
    "colorBackgroundStatusError": "--color-background-status-error-5fz45j",
    "colorBackgroundStatusInfo": "--color-background-status-info-gflgo4",
    "colorBackgroundStatusSuccess": "--color-background-status-success-ua29ej",
    "colorBackgroundStatusWarning": "--color-background-status-warning-03nxlw",
    "colorBackgroundTableHeader": "--color-background-table-header-inc72b",
    "colorBackgroundTilesDisabled": "--color-background-tiles-disabled-ozblza",
    "colorBackgroundToggleCheckedDisabled": "--color-background-toggle-checked-disabled-wk1i1j",
    "colorBackgroundToggleDefault": "--color-background-toggle-default-ywflhx",
    "colorBackgroundAvatarGenAi": "--color-background-avatar-gen-ai-i9hcw6",
    "colorBackgroundAvatarDefault": "--color-background-avatar-default-rci9zy",
    "colorTextAvatar": "--color-text-avatar-jddpvm",
    "colorBackgroundLoadingBarGenAi": "--color-background-loading-bar-gen-ai-7qfi9s",
    "colorBackgroundChatBubbleOutgoing": "--color-background-chat-bubble-outgoing-pfqan2",
    "colorBackgroundChatBubbleIncoming": "--color-background-chat-bubble-incoming-8pi0ow",
    "colorTextChatBubbleOutgoing": "--color-text-chat-bubble-outgoing-bvbr0v",
    "colorTextChatBubbleIncoming": "--color-text-chat-bubble-incoming-x2kig8",
    "colorBorderButtonNormalActive": "--color-border-button-normal-active-mn0ayd",
    "colorBorderButtonNormalDefault": "--color-border-button-normal-default-uzqi0v",
    "colorBorderToggleButtonNormalPressed": "--color-border-toggle-button-normal-pressed-lylxt2",
    "colorBorderButtonNormalDisabled": "--color-border-button-normal-disabled-caqkhj",
    "colorTextButtonNormalDisabled": "--color-text-button-normal-disabled-0s30to",
    "colorBorderButtonNormalHover": "--color-border-button-normal-hover-2d2g0m",
    "colorBorderButtonPrimaryDisabled": "--color-border-button-primary-disabled-xtv38q",
    "colorTextButtonPrimaryDisabled": "--color-text-button-primary-disabled-klolb5",
    "colorBorderCalendarGrid": "--color-border-calendar-grid-u86q1u",
    "colorBorderCalendarGridSelectedFocusRing": "--color-border-calendar-grid-selected-focus-ring-w7gc9h",
    "colorBorderCodeEditorAceActiveLineLightTheme": "--color-border-code-editor-ace-active-line-light-theme-3a7k5r",
    "colorBorderCodeEditorAceActiveLineDarkTheme": "--color-border-code-editor-ace-active-line-dark-theme-8s541m",
    "colorBorderCodeEditorDefault": "--color-border-code-editor-default-u6q2xy",
    "colorBorderCodeEditorPaneItemHover": "--color-border-code-editor-pane-item-hover-qonm1g",
    "colorBorderContainerDivider": "--color-border-container-divider-p2uygo",
    "colorBorderContainerTop": "--color-border-container-top-736buh",
    "colorBorderControlChecked": "--color-border-control-checked-vu1puo",
    "colorBorderControlDefault": "--color-border-control-default-8m5t80",
    "colorBorderControlDisabled": "--color-border-control-disabled-qc5csz",
    "colorBorderDividerActive": "--color-border-divider-active-tn8t2p",
    "colorBorderDividerDefault": "--color-border-divider-default-cx07f2",
    "colorBorderDividerPanelBottom": "--color-border-divider-panel-bottom-c62zji",
    "colorBorderDividerPanelSide": "--color-border-divider-panel-side-j1ubnj",
    "colorBorderDividerSecondary": "--color-border-divider-secondary-alwp8z",
    "colorBorderDropdownContainer": "--color-border-dropdown-container-fo7aoz",
    "colorBorderDropdownGroup": "--color-border-dropdown-group-2xoluv",
    "colorBorderDropdownItemDefault": "--color-border-dropdown-item-default-xiw1xo",
    "colorBorderDropdownItemHover": "--color-border-dropdown-item-hover-4p0gsi",
    "colorBorderDropdownItemDimmedHover": "--color-border-dropdown-item-dimmed-hover-6qayyi",
    "colorBorderDropdownItemSelected": "--color-border-dropdown-item-selected-rtthnt",
    "colorBorderDropdownItemTop": "--color-border-dropdown-item-top-ky64jq",
    "colorBorderEditableCellHover": "--color-border-editable-cell-hover-3ju944",
    "colorBorderInputDefault": "--color-border-input-default-l7v83d",
    "colorBorderInputDisabled": "--color-border-input-disabled-lb7zn3",
    "colorBorderInputFocused": "--color-border-input-focused-c6w5i5",
    "colorBorderItemFocused": "--color-border-item-focused-nv6mhz",
    "colorBorderDropdownItemFocused": "--color-border-dropdown-item-focused-5afjvu",
    "colorBorderItemPlaceholder": "--color-border-item-placeholder-h6zoax",
    "colorBorderItemSelected": "--color-border-item-selected-m769ej",
    "colorBorderLayout": "--color-border-layout-hrw5xj",
    "colorBorderNotificationStackBar": "--color-border-notification-stack-bar-hrqqk8",
    "colorBorderPanelHeader": "--color-border-panel-header-nnst86",
    "colorBorderPopover": "--color-border-popover-v2sc7l",
    "colorBorderSegmentActive": "--color-border-segment-active-0hw1oi",
    "colorBorderSegmentDefault": "--color-border-segment-default-qegins",
    "colorBorderSegmentDisabled": "--color-border-segment-disabled-jfhyf7",
    "colorBorderSegmentHover": "--color-border-segment-hover-cs1sac",
    "colorBorderStatusError": "--color-border-status-error-adxa56",
    "colorBorderStatusInfo": "--color-border-status-info-z6pwqy",
    "colorBorderStatusSuccess": "--color-border-status-success-4x6srk",
    "colorBorderStatusWarning": "--color-border-status-warning-3feumr",
    "colorBorderDividerInteractiveDefault": "--color-border-divider-interactive-default-0c10au",
    "colorBorderTabsDivider": "--color-border-tabs-divider-djfdfj",
    "colorBorderTabsShadow": "--color-border-tabs-shadow-enjrr2",
    "colorBorderTabsUnderline": "--color-border-tabs-underline-s9x2il",
    "colorBorderTilesDisabled": "--color-border-tiles-disabled-9w9xuo",
    "colorBorderTutorial": "--color-border-tutorial-upbl0e",
    "colorForegroundControlDefault": "--color-foreground-control-default-p84gz5",
    "colorForegroundControlDisabled": "--color-foreground-control-disabled-c64ihu",
    "colorForegroundControlReadOnly": "--color-foreground-control-read-only-e43ooq",
    "colorShadowDefault": "--color-shadow-default-u7prpu",
    "colorShadowMedium": "--color-shadow-medium-aogong",
    "colorShadowSide": "--color-shadow-side-htkwff",
    "colorStrokeChartLine": "--color-stroke-chart-line-i586tw",
    "colorStrokeCodeEditorResizeHandler": "--color-stroke-code-editor-resize-handler-nn8o8u",
    "colorStrokeCodeEditorGutterActiveLineDefault": "--color-stroke-code-editor-gutter-active-line-default-s9ueow",
    "colorStrokeCodeEditorGutterActiveLineHover": "--color-stroke-code-editor-gutter-active-line-hover-8p756l",
    "colorTextAccent": "--color-text-accent-npa5tq",
    "colorTextBodyDefault": "--color-text-body-default-7v1jfn",
    "colorTextBodySecondary": "--color-text-body-secondary-cwla8d",
    "colorTextBreadcrumbCurrent": "--color-text-breadcrumb-current-9h12sf",
    "colorTextBreadcrumbIcon": "--color-text-breadcrumb-icon-u5luu4",
    "colorTextButtonInlineIconDefault": "--color-text-button-inline-icon-default-p881yb",
    "colorTextButtonInlineIconDisabled": "--color-text-button-inline-icon-disabled-yk9lvs",
    "colorTextButtonInlineIconHover": "--color-text-button-inline-icon-hover-vcdou1",
    "colorTextButtonNormalActive": "--color-text-button-normal-active-fdnwsh",
    "colorTextToggleButtonNormalPressed": "--color-text-toggle-button-normal-pressed-n7ydno",
    "colorTextButtonNormalDefault": "--color-text-button-normal-default-476t5h",
    "colorTextButtonNormalHover": "--color-text-button-normal-hover-e3tg09",
    "colorTextLinkButtonNormalDefault": "--color-text-link-button-normal-default-chde6e",
    "colorTextLinkButtonNormalHover": "--color-text-link-button-normal-hover-t7l3n9",
    "colorTextLinkButtonNormalActive": "--color-text-link-button-normal-active-awr7yi",
    "colorTextButtonPrimaryActive": "--color-text-button-primary-active-l1tdpc",
    "colorTextButtonPrimaryDefault": "--color-text-button-primary-default-t0t2sj",
    "colorTextButtonPrimaryHover": "--color-text-button-primary-hover-5z07s7",
    "colorTextCalendarDateHover": "--color-text-calendar-date-hover-qiity9",
    "colorTextCalendarDateSelected": "--color-text-calendar-date-selected-xnreq1",
    "colorTextCalendarMonth": "--color-text-calendar-month-7dq80e",
    "colorTextCodeEditorGutterActiveLine": "--color-text-code-editor-gutter-active-line-xn0lux",
    "colorTextCodeEditorGutterDefault": "--color-text-code-editor-gutter-default-wzd6uj",
    "colorTextCodeEditorStatusBarDisabled": "--color-text-code-editor-status-bar-disabled-wlvfa0",
    "colorTextCodeEditorTabButtonError": "--color-text-code-editor-tab-button-error-491d5d",
    "colorTextColumnHeader": "--color-text-column-header-18yqaj",
    "colorTextColumnSortingIcon": "--color-text-column-sorting-icon-4y2if8",
    "colorTextControlDisabled": "--color-text-control-disabled-7u2yiq",
    "colorTextCounter": "--color-text-counter-goqopo",
    "colorTextDisabled": "--color-text-disabled-e4vsj4",
    "colorTextDisabledInlineEdit": "--color-text-disabled-inline-edit-rcb2pm",
    "colorTextDropdownFooter": "--color-text-dropdown-footer-1jyb4n",
    "colorTextDropdownGroupLabel": "--color-text-dropdown-group-label-iy2p4t",
    "colorTextDropdownItemDefault": "--color-text-dropdown-item-default-wpxsrk",
    "colorTextDropdownItemDimmed": "--color-text-dropdown-item-dimmed-7c5xo0",
    "colorTextDropdownItemDisabled": "--color-text-dropdown-item-disabled-7fg5u8",
    "colorTextDropdownItemFilterMatch": "--color-text-dropdown-item-filter-match-vwk0li",
    "colorTextDropdownItemHighlighted": "--color-text-dropdown-item-highlighted-rnfxxj",
    "colorTextDropdownItemSecondary": "--color-text-dropdown-item-secondary-xvh5zo",
    "colorTextDropdownItemSecondaryHover": "--color-text-dropdown-item-secondary-hover-4xn5ec",
    "colorTextEmpty": "--color-text-empty-o6660v",
    "colorTextExpandableSectionDefault": "--color-text-expandable-section-default-7w1jwq",
    "colorTextExpandableSectionHover": "--color-text-expandable-section-hover-rmgl6x",
    "colorTextExpandableSectionNavigationIconDefault": "--color-text-expandable-section-navigation-icon-default-tbe28s",
    "colorTextFormDefault": "--color-text-form-default-nsrnwd",
    "colorTextFormLabel": "--color-text-form-label-5nbxa6",
    "colorTextFormSecondary": "--color-text-form-secondary-54emib",
    "colorTextGroupLabel": "--color-text-group-label-8pk3es",
    "colorTextLabelGenAi": "--color-text-label-gen-ai-76ots7",
    "colorTextHeadingDefault": "--color-text-heading-default-jen9ei",
    "colorTextHeadingSecondary": "--color-text-heading-secondary-0myrp3",
    "colorTextHomeHeaderDefault": "--color-text-home-header-default-ressfo",
    "colorTextHomeHeaderSecondary": "--color-text-home-header-secondary-iqyyqx",
    "colorTextIconCaret": "--color-text-icon-caret-t91iw3",
    "colorTextIconSubtle": "--color-text-icon-subtle-pt80lq",
    "colorTextInputDisabled": "--color-text-input-disabled-fc4jfl",
    "colorTextInputPlaceholder": "--color-text-input-placeholder-f3x213",
    "colorTextInputPlaceholderDisabled": "--color-text-input-placeholder-disabled-7v2f7f",
    "colorTextInteractiveActive": "--color-text-interactive-active-j6vw94",
    "colorTextInteractiveDefault": "--color-text-interactive-default-tkx8fe",
    "colorTextInteractiveDisabled": "--color-text-interactive-disabled-f5b4z5",
    "colorTextInteractiveHover": "--color-text-interactive-hover-f9gqs8",
    "colorTextToggleButtonIconPressed": "--color-text-toggle-button-icon-pressed-d40d50",
    "colorTextInteractiveInvertedDefault": "--color-text-interactive-inverted-default-8v8d60",
    "colorTextInteractiveInvertedHover": "--color-text-interactive-inverted-hover-0r4deg",
    "colorTextInverted": "--color-text-inverted-pvc88w",
    "colorTextLabel": "--color-text-label-4yezqy",
    "colorTextLayoutToggle": "--color-text-layout-toggle-zybz0r",
    "colorTextLayoutToggleActive": "--color-text-layout-toggle-active-as4nbt",
    "colorTextLayoutToggleHover": "--color-text-layout-toggle-hover-v3lnw5",
    "colorTextLayoutToggleSelected": "--color-text-layout-toggle-selected-kb3p9r",
    "colorTextLinkDefault": "--color-text-link-default-enwvrt",
    "colorTextLinkHover": "--color-text-link-hover-49uoe9",
    "colorTextLinkInvertedHover": "--color-text-link-inverted-hover-zsv0ev",
    "colorTextLinkButtonUnderline": "--color-text-link-button-underline-ik5r9i",
    "colorTextLinkButtonUnderlineHover": "--color-text-link-button-underline-hover-gyir88",
    "colorTextNotificationDefault": "--color-text-notification-default-0l2rzu",
    "colorTextNotificationStackBar": "--color-text-notification-stack-bar-jc9tvx",
    "colorTextNotificationYellow": "--color-text-notification-yellow-p8f867",
    "colorTextPaginationPageNumberActiveDisabled": "--color-text-pagination-page-number-active-disabled-a19yjt",
    "colorTextPaginationPageNumberDefault": "--color-text-pagination-page-number-default-s25kr0",
    "colorTextSegmentActive": "--color-text-segment-active-fc6owc",
    "colorTextSegmentDefault": "--color-text-segment-default-iib3us",
    "colorTextSegmentHover": "--color-text-segment-hover-88u58t",
    "colorTextSmall": "--color-text-small-nzfntg",
    "colorTextStatusError": "--color-text-status-error-5676bj",
    "colorTextStatusInactive": "--color-text-status-inactive-5megna",
    "colorTextStatusInfo": "--color-text-status-info-7rlubr",
    "colorTextStatusSuccess": "--color-text-status-success-gqp5xk",
    "colorTextStatusWarning": "--color-text-status-warning-csaw41",
    "colorTextTopNavigationTitle": "--color-text-top-navigation-title-v9cb3m",
    "colorBoardPlaceholderActive": "--color-board-placeholder-active-93q92g",
    "colorBoardPlaceholderHover": "--color-board-placeholder-hover-yu7ixx",
    "colorDragPlaceholderActive": "--color-drag-placeholder-active-llvhbu",
    "colorDragPlaceholderHover": "--color-drag-placeholder-hover-oikifl",
    "colorDropzoneBackgroundDefault": "--color-dropzone-background-default-q8kl4f",
    "colorDropzoneBackgroundHover": "--color-dropzone-background-hover-wl3yez",
    "colorDropzoneTextDefault": "--color-dropzone-text-default-owo5k2",
    "colorDropzoneTextHover": "--color-dropzone-text-hover-wteupn",
    "colorDropzoneBorderDefault": "--color-dropzone-border-default-phwpnt",
    "colorDropzoneBorderHover": "--color-dropzone-border-hover-tpluhc",
    "fontBoxValueLargeWeight": "--font-box-value-large-weight-onoq9k",
    "fontButtonLetterSpacing": "--font-button-letter-spacing-65ug0o",
    "fontChartDetailSize": "--font-chart-detail-size-1n389u",
    "fontDisplayLabelWeight": "--font-display-label-weight-815ja9",
    "fontExpandableHeadingSize": "--font-expandable-heading-size-smdiul",
    "fontFamilyBase": "--font-family-base-eynpfp",
    "fontFamilyMonospace": "--font-family-monospace-bftdwf",
    "fontHeaderH2DescriptionLineHeight": "--font-header-h2-description-line-height-rtewek",
    "fontHeaderH2DescriptionSize": "--font-header-h2-description-size-2hj97p",
    "fontLinkButtonLetterSpacing": "--font-link-button-letter-spacing-yi9f0l",
    "fontLinkButtonWeight": "--font-link-button-weight-jephf1",
    "fontPanelHeaderLineHeight": "--font-panel-header-line-height-kxi4u2",
    "fontPanelHeaderSize": "--font-panel-header-size-edjz3l",
    "fontSizeBodyM": "--font-size-body-m-x4okxb",
    "fontSizeBodyS": "--font-size-body-s-asqx2i",
    "fontSizeDisplayL": "--font-size-display-l-htkq3e",
    "fontSizeHeadingXl": "--font-size-heading-xl-ypc05a",
    "fontSizeHeadingL": "--font-size-heading-l-ou0d0l",
    "fontSizeHeadingM": "--font-size-heading-m-sjd256",
    "fontSizeHeadingS": "--font-size-heading-s-yykzif",
    "fontSizeHeadingXs": "--font-size-heading-xs-wo4hpf",
    "fontSmoothingMozOsx": "--font-smoothing-moz-osx-foywby",
    "fontSmoothingWebkit": "--font-smoothing-webkit-m8nc84",
    "fontTabsDisabledWeight": "--font-tabs-disabled-weight-1xcs5l",
    "fontTabsLineHeight": "--font-tabs-line-height-dzo7k3",
    "fontTabsSize": "--font-tabs-size-8zzqp2",
    "fontWayfindingLinkActiveWeight": "--font-wayfinding-link-active-weight-rbmzei",
    "fontWeightButton": "--font-weight-button-c91p4t",
    "fontWeightHeadingXl": "--font-weight-heading-xl-yvsksd",
    "fontWeightHeadingL": "--font-weight-heading-l-f8711v",
    "fontWeightHeadingM": "--font-weight-heading-m-m2ekmb",
    "fontWeightHeadingS": "--font-weight-heading-s-cwn6wc",
    "fontWeightHeadingXs": "--font-weight-heading-xs-l7rqme",
    "fontWeightHeavy": "--font-weight-heavy-cqd9pv",
    "letterSpacingBodyS": "--letter-spacing-body-s-z9jkwp",
    "letterSpacingDisplayL": "--letter-spacing-display-l-9cigop",
    "letterSpacingHeadingXl": "--letter-spacing-heading-xl-sagq9c",
    "letterSpacingHeadingL": "--letter-spacing-heading-l-qqjd4y",
    "letterSpacingHeadingM": "--letter-spacing-heading-m-0w575i",
    "letterSpacingHeadingS": "--letter-spacing-heading-s-jr3mor",
    "lineHeightBodyM": "--line-height-body-m-30ar75",
    "lineHeightBodyS": "--line-height-body-s-7zv1j5",
    "lineHeightDisplayL": "--line-height-display-l-8nioft",
    "lineHeightHeadingXl": "--line-height-heading-xl-avbttk",
    "lineHeightHeadingL": "--line-height-heading-l-mmm3my",
    "lineHeightHeadingM": "--line-height-heading-m-50evfk",
    "lineHeightHeadingS": "--line-height-heading-s-4i6ewn",
    "lineHeightHeadingXs": "--line-height-heading-xs-aeleja",
    "borderActiveWidth": "--border-active-width-9dmqf4",
    "borderCodeEditorStatusDividerWidth": "--border-code-editor-status-divider-width-tf47q3",
    "borderContainerStickyWidth": "--border-container-sticky-width-6asz33",
    "borderContainerTopWidth": "--border-container-top-width-uugwwl",
    "borderControlFocusRingShadowSpread": "--border-control-focus-ring-shadow-spread-0ctpjf",
    "borderControlInvalidFocusRingShadowSpread": "--border-control-invalid-focus-ring-shadow-spread-fhmbjn",
    "borderDividerListWidth": "--border-divider-list-width-27y3k5",
    "borderDividerSectionWidth": "--border-divider-section-width-1061zr",
    "borderDropdownVirtualOffsetWidth": "--border-dropdown-virtual-offset-width-kekgc0",
    "borderInvalidWidth": "--border-invalid-width-5ktjp2",
    "borderItemWidth": "--border-item-width-yel47s",
    "borderLineChartDashArray": "--border-line-chart-dash-array-k49cgz",
    "borderLineChartLineJoin": "--border-line-chart-line-join-hdz0jf",
    "borderLineChartWidth": "--border-line-chart-width-9mzos2",
    "borderPanelHeaderWidth": "--border-panel-header-width-3w1py7",
    "borderPanelTopWidth": "--border-panel-top-width-7uc0w9",
    "borderRadiusAlert": "--border-radius-alert-mdtrse",
    "borderRadiusBadge": "--border-radius-badge-0z09dt",
    "borderRadiusButton": "--border-radius-button-hbwkej",
    "borderRadiusCalendarDayFocusRing": "--border-radius-calendar-day-focus-ring-545h0w",
    "borderRadiusCodeEditor": "--border-radius-code-editor-qvw11o",
    "borderRadiusContainer": "--border-radius-container-wqv1zi",
    "borderRadiusControlCircularFocusRing": "--border-radius-control-circular-focus-ring-w07mub",
    "borderRadiusControlDefaultFocusRing": "--border-radius-control-default-focus-ring-u8zbsz",
    "borderRadiusDropdown": "--border-radius-dropdown-0dhh79",
    "borderRadiusDropzone": "--border-radius-dropzone-4sx861",
    "borderRadiusFlashbar": "--border-radius-flashbar-hcdl9q",
    "borderRadiusItem": "--border-radius-item-05df9h",
    "borderRadiusInput": "--border-radius-input-plgbrq",
    "borderRadiusPopover": "--border-radius-popover-clv1ya",
    "borderRadiusTabsFocusRing": "--border-radius-tabs-focus-ring-1q0rjo",
    "borderRadiusTiles": "--border-radius-tiles-60y8e6",
    "borderRadiusToken": "--border-radius-token-923jqq",
    "borderRadiusChatBubble": "--border-radius-chat-bubble-qvkt36",
    "borderRadiusTutorialPanelItem": "--border-radius-tutorial-panel-item-b44p0a",
    "borderTableStickyWidth": "--border-table-sticky-width-87kf12",
    "borderLinkFocusRingOutline": "--border-link-focus-ring-outline-kkfop6",
    "borderLinkFocusRingShadowSpread": "--border-link-focus-ring-shadow-spread-v8hkrl",
    "borderWidthAlert": "--border-width-alert-t0f3yn",
    "borderWidthField": "--border-width-field-h1g7tw",
    "borderWidthPopover": "--border-width-popover-h2a419",
    "motionDurationExtraFast": "--motion-duration-extra-fast-3huyux",
    "motionDurationExtraSlow": "--motion-duration-extra-slow-ngjb9g",
    "motionDurationFast": "--motion-duration-fast-sbm3r7",
    "motionDurationModerate": "--motion-duration-moderate-5k1phv",
    "motionDurationRefreshOnlyAmbient": "--motion-duration-refresh-only-ambient-hnjwnd",
    "motionDurationRefreshOnlyFast": "--motion-duration-refresh-only-fast-4jn2d7",
    "motionDurationRefreshOnlyMedium": "--motion-duration-refresh-only-medium-nf6485",
    "motionDurationRefreshOnlySlow": "--motion-duration-refresh-only-slow-zbvbxt",
    "motionDurationAvatarGenAiGradient": "--motion-duration-avatar-gen-ai-gradient-xetl2o",
    "motionDurationAvatarLoadingDots": "--motion-duration-avatar-loading-dots-pe8a3q",
    "motionDurationRotate180": "--motion-duration-rotate-180-dpvl4m",
    "motionDurationRotate90": "--motion-duration-rotate-90-4ry26y",
    "motionDurationShowPaced": "--motion-duration-show-paced-q2lo2h",
    "motionDurationShowQuick": "--motion-duration-show-quick-aq3ump",
    "motionDurationSlow": "--motion-duration-slow-z2kaah",
    "motionDurationTransitionQuick": "--motion-duration-transition-quick-6npj01",
    "motionDurationTransitionShowPaced": "--motion-duration-transition-show-paced-9s9l5z",
    "motionDurationTransitionShowQuick": "--motion-duration-transition-show-quick-osg026",
    "motionEasingEaseOutQuart": "--motion-easing-ease-out-quart-rrej5m",
    "motionEasingRefreshOnlyA": "--motion-easing-refresh-only-a-8flf9q",
    "motionEasingRefreshOnlyB": "--motion-easing-refresh-only-b-ufhmjm",
    "motionEasingRefreshOnlyC": "--motion-easing-refresh-only-c-vg1m9h",
    "motionEasingRefreshOnlyD": "--motion-easing-refresh-only-d-3kjugn",
    "motionEasingAvatarGenAiGradient": "--motion-easing-avatar-gen-ai-gradient-tjyrpp",
    "motionEasingRotate180": "--motion-easing-rotate-180-e270ko",
    "motionEasingRotate90": "--motion-easing-rotate-90-sb4dk7",
    "motionEasingShowPaced": "--motion-easing-show-paced-ne2o0s",
    "motionEasingShowQuick": "--motion-easing-show-quick-vc5zgd",
    "motionEasingTransitionQuick": "--motion-easing-transition-quick-l9jfsx",
    "motionEasingTransitionShowPaced": "--motion-easing-transition-show-paced-eobwvi",
    "motionEasingTransitionShowQuick": "--motion-easing-transition-show-quick-urd1sm",
    "motionEasingResponsive": "--motion-easing-responsive-vbn2t8",
    "motionEasingSticky": "--motion-easing-sticky-56u8cd",
    "motionEasingExpressive": "--motion-easing-expressive-jz8pes",
    "motionDurationResponsive": "--motion-duration-responsive-67fgfp",
    "motionDurationExpressive": "--motion-duration-expressive-0by09d",
    "motionDurationComplex": "--motion-duration-complex-vy4sma",
    "motionKeyframesFadeIn": "--motion-keyframes-fade-in-gpabjb",
    "motionKeyframesFadeOut": "--motion-keyframes-fade-out-kva0ei",
    "motionKeyframesStatusIconError": "--motion-keyframes-status-icon-error-ldv006",
    "motionKeyframesScalePopup": "--motion-keyframes-scale-popup-d42fd1",
    "sizeCalendarGridWidth": "--size-calendar-grid-width-lrunz7",
    "sizeControl": "--size-control-28i7hr",
    "sizeIconBig": "--size-icon-big-zkdryd",
    "sizeIconLarge": "--size-icon-large-bivhmh",
    "sizeIconMedium": "--size-icon-medium-y9xuoq",
    "sizeIconNormal": "--size-icon-normal-0m1722",
    "sizeTableSelectionHorizontal": "--size-table-selection-horizontal-oqvl1b",
    "sizeVerticalInput": "--size-vertical-input-v5iwwf",
    "sizeVerticalPanelIconOffset": "--size-vertical-panel-icon-offset-wy8j08",
    "spaceAlertActionLeft": "--space-alert-action-left-ea9czk",
    "spaceAlertHorizontal": "--space-alert-horizontal-eyt1xx",
    "spaceAlertMessageRight": "--space-alert-message-right-knlb6u",
    "spaceAlertVertical": "--space-alert-vertical-l6cc71",
    "spaceButtonFocusOutlineGutter": "--space-button-focus-outline-gutter-cqfd0c",
    "spaceButtonHorizontal": "--space-button-horizontal-8jxzea",
    "spaceButtonIconFocusOutlineGutterVertical": "--space-button-icon-focus-outline-gutter-vertical-zgqy8m",
    "spaceButtonIconOnlyHorizontal": "--space-button-icon-only-horizontal-zsf2nw",
    "spaceButtonInlineIconFocusOutlineGutter": "--space-button-inline-icon-focus-outline-gutter-vk4r2v",
    "spaceButtonModalDismissVertical": "--space-button-modal-dismiss-vertical-0n4y5m",
    "spaceCalendarGridFocusOutlineGutter": "--space-calendar-grid-focus-outline-gutter-g00bgj",
    "spaceCalendarGridSelectedFocusOutlineGutter": "--space-calendar-grid-selected-focus-outline-gutter-hxbct6",
    "spaceCalendarGridGutter": "--space-calendar-grid-gutter-2jsrps",
    "spaceCardHorizontal": "--space-card-horizontal-tuwbbd",
    "spaceCardVertical": "--space-card-vertical-m591he",
    "spaceCodeEditorStatusFocusOutlineGutter": "--space-code-editor-status-focus-outline-gutter-dqxswe",
    "spaceContainerContentTop": "--space-container-content-top-1ae0r3",
    "spaceContainerHeaderTop": "--space-container-header-top-5qav00",
    "spaceContainerHeaderBottom": "--space-container-header-bottom-vj01hn",
    "spaceContainerHorizontal": "--space-container-horizontal-wfukh3",
    "spaceContentHeaderPaddingBottom": "--space-content-header-padding-bottom-y2enua",
    "spaceDarkHeaderOverlapDistance": "--space-dark-header-overlap-distance-lxpp0s",
    "spaceExpandableSectionIconOffsetTop": "--space-expandable-section-icon-offset-top-ekk5vc",
    "spaceFieldHorizontal": "--space-field-horizontal-gg19kw",
    "spaceFieldIconOffset": "--space-field-icon-offset-csk9vw",
    "spaceFilteringTokenDismissButtonFocusOutlineGutter": "--space-filtering-token-dismiss-button-focus-outline-gutter-76gsim",
    "spaceFilteringTokenOperationSelectFocusOutlineGutter": "--space-filtering-token-operation-select-focus-outline-gutter-0ailok",
    "spaceFlashbarActionLeft": "--space-flashbar-action-left-qkhz5m",
    "spaceFlashbarDismissRight": "--space-flashbar-dismiss-right-tcpfax",
    "spaceFlashbarHorizontal": "--space-flashbar-horizontal-xmjla3",
    "spaceGridGutter": "--space-grid-gutter-ieqn7e",
    "spaceKeyValueGap": "--space-key-value-gap-0517k5",
    "spaceLayoutContentBottom": "--space-layout-content-bottom-noqzmw",
    "spaceLayoutContentHorizontal": "--space-layout-content-horizontal-7l52k3",
    "spaceLayoutToggleDiameter": "--space-layout-toggle-diameter-hb85rk",
    "spaceLayoutTogglePadding": "--space-layout-toggle-padding-lcu6qi",
    "spaceModalContentBottom": "--space-modal-content-bottom-hqahub",
    "spaceModalHorizontal": "--space-modal-horizontal-f89syl",
    "spaceOptionIconBigTop": "--space-option-icon-big-top-hybljv",
    "spacePanelContentBottom": "--space-panel-content-bottom-7k6er3",
    "spacePanelContentTop": "--space-panel-content-top-wac3yp",
    "spacePanelDividerMarginHorizontal": "--space-panel-divider-margin-horizontal-sbik1z",
    "spacePanelHeaderVertical": "--space-panel-header-vertical-gv9pti",
    "spacePanelNavLeft": "--space-panel-nav-left-b1g0mt",
    "spacePanelSideLeft": "--space-panel-side-left-5t0who",
    "spacePanelSideRight": "--space-panel-side-right-xofg51",
    "spacePanelSplitTop": "--space-panel-split-top-q1pux4",
    "spacePanelSplitBottom": "--space-panel-split-bottom-qwdduf",
    "spaceSegmentedControlFocusOutlineGutter": "--space-segmented-control-focus-outline-gutter-gbye20",
    "spaceTabsContentTop": "--space-tabs-content-top-dedu0k",
    "spaceTabsFocusOutlineGutter": "--space-tabs-focus-outline-gutter-xm37ly",
    "spaceTableContentBottom": "--space-table-content-bottom-9yr834",
    "spaceTableEmbeddedHeaderTop": "--space-table-embedded-header-top-bfjeam",
    "spaceTableFooterHorizontal": "--space-table-footer-horizontal-ptapb9",
    "spaceTableHeaderFocusOutlineGutter": "--space-table-header-focus-outline-gutter-7js4en",
    "spaceTableHeaderHorizontal": "--space-table-header-horizontal-wl3ykr",
    "spaceTableHeaderToolsBottom": "--space-table-header-tools-bottom-25ubsj",
    "spaceTableHeaderToolsFullPageBottom": "--space-table-header-tools-full-page-bottom-xulfq9",
    "spaceTableHorizontal": "--space-table-horizontal-8davlm",
    "spaceTileGutter": "--space-tile-gutter-fuuodu",
    "spaceScaled2xNone": "--space-scaled-2x-none-8i5al4",
    "spaceScaled2xXxxs": "--space-scaled-2x-xxxs-fp07j9",
    "spaceScaled2xXxs": "--space-scaled-2x-xxs-7v8ivz",
    "spaceScaled2xXs": "--space-scaled-2x-xs-cijznx",
    "spaceScaled2xS": "--space-scaled-2x-s-owsac7",
    "spaceScaled2xM": "--space-scaled-2x-m-owtj1o",
    "spaceScaled2xL": "--space-scaled-2x-l-ujnz41",
    "spaceScaled2xXl": "--space-scaled-2x-xl-udij7m",
    "spaceScaled2xXxl": "--space-scaled-2x-xxl-ts4prk",
    "spaceScaled2xXxxl": "--space-scaled-2x-xxxl-eqb3m6",
    "spaceScaledNone": "--space-scaled-none-vhzhxe",
    "spaceScaledXxxs": "--space-scaled-xxxs-27y4hv",
    "spaceScaledXxs": "--space-scaled-xxs-7597g1",
    "spaceScaledXs": "--space-scaled-xs-26e2du",
    "spaceScaledS": "--space-scaled-s-aqzyko",
    "spaceScaledM": "--space-scaled-m-mo5yse",
    "spaceScaledL": "--space-scaled-l-0hpmd7",
    "spaceScaledXl": "--space-scaled-xl-kswcw7",
    "spaceScaledXxl": "--space-scaled-xxl-wbot5q",
    "spaceScaledXxxl": "--space-scaled-xxxl-fdg8ai",
    "spaceStaticXxxs": "--space-static-xxxs-3gu9os",
    "spaceStaticXxs": "--space-static-xxs-82cdfi",
    "spaceStaticXs": "--space-static-xs-7sfb63",
    "spaceStaticS": "--space-static-s-n2eb28",
    "spaceStaticM": "--space-static-m-lrhgl2",
    "spaceStaticL": "--space-static-l-0xsx8r",
    "spaceStaticXl": "--space-static-xl-qalw6z",
    "spaceStaticXxl": "--space-static-xxl-02zgl2",
    "spaceStaticXxxl": "--space-static-xxxl-qj5g91",
    "spaceNone": "--space-none-zrljql",
    "spaceXxxs": "--space-xxxs-zbmxqb",
    "spaceXxs": "--space-xxs-p8yyaw",
    "spaceXs": "--space-xs-zb16t3",
    "spaceS": "--space-s-34lx8l",
    "spaceM": "--space-m-udix3p",
    "spaceL": "--space-l-t419sm",
    "spaceXl": "--space-xl-lmui9r",
    "spaceXxl": "--space-xxl-cu2m1r",
    "spaceXxxl": "--space-xxxl-4x2gki",
    "shadowContainer": "--shadow-container-fxmdn3",
    "shadowContainerStacked": "--shadow-container-stacked-4gw245",
    "shadowContainerActive": "--shadow-container-active-kl29x9",
    "shadowDropdown": "--shadow-dropdown-e5guvm",
    "shadowDropup": "--shadow-dropup-xqkiza",
    "shadowFlashCollapsed": "--shadow-flash-collapsed-s7gipk",
    "shadowFlashSticky": "--shadow-flash-sticky-pq8cuq",
    "shadowModal": "--shadow-modal-2ennni",
    "shadowPanel": "--shadow-panel-g6fkp1",
    "shadowPanelToggle": "--shadow-panel-toggle-0l64f2",
    "shadowPopover": "--shadow-popover-8zls8c",
    "shadowSplitBottom": "--shadow-split-bottom-5e389u",
    "shadowSplitSide": "--shadow-split-side-ggdtnk",
    "shadowSticky": "--shadow-sticky-blixp9",
    "shadowStickyEmbedded": "--shadow-sticky-embedded-uvh5ry",
    "shadowStickyColumnFirst": "--shadow-sticky-column-first-039dqs",
    "shadowStickyColumnLast": "--shadow-sticky-column-last-n170vw"
  }
};
