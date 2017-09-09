$(document).ready(function() {

  //   === Global variables ===

  var latitude = 38.20523; // Latitude of Messina, Italy
  var longitude = 15.55972; // Longitude of Messina, Italy
  var timeZone = "Europe/Rome"; // The time zone of Messina, Italy
  var inizialZoom = 12; // Initial map zoom level

  var tileServerURL = "http://{s}.tile.osm.org/{z}/{x}/{y}.png"; // Tile server URL
  var credits = "&copy; <a href=\"http://osm.org/copyright\">OpenStreetMap</a> - by <b>Ciam</b>";

  // List of the site’s datasets (packages) and their resources (CKAN’s API)
  var datasetsList_url = "http://smartme-data.unime.it/api/3/action/current_package_list_with_resources";

  // List of not working boards
  var notWorkingBoards = ["", "sme-00-0006 - Policlinico Universitario", "sme-00-0016 - Villa Pace"];

  var ckanOrganization = "SmartMe"; // CKAN's 'organization' field for the #SmartMe project

  // Datasets list
  var datasets = [];


  //   === Global variables: data retrieval ===

  var fullData = [];
  var deferreds = [];

  var sens_ls = ["temperature", "brightness", "humidity", "pressure", "gas", "noise"]; // Sensors list

  var requiredData = sens_ls[0]; // Data to retrieve: default is temperature

  var retrieveAll = false; // 'true': to retrieve all the 'requiredData' samples
                           // from the database


  //   === Global variables: 'time machine' configuration ===

  var timeMachine; // Refers to the 'time machine' instance.

  var dataProcSel = "hourly"; // "hourly": collected data is processed to be visualized
                              // on an hourly base.


  // The hourly time machine configuration: each 'dataframe' is equally spaced
  // from the frame before (see: ticksInterval field).

  var hourlyConfig = {

    ticksInterval: 120, // expressed in minutes

    from_thisDate: '',
    to_thisDate: '',

    init: function() {

      var current = moment.utc(); // Current date and time (UTC)

      this.from_thisDate = current;
      this.to_thisDate = current.clone().subtract(1, 'days'); // default configuration: 'time machine'
                                                              // goes back in time 24 hours
    },

    heatmapDataPoints: [],

    // heatmapDataPoints stores the processed data. Each element of the array
    // (that is also an array) is related to a different 'dataframe' (therefore, a different heatmap).
  };

  hourlyConfig.init();


  //   === Map creation and heatmap ===

  // The default map (see: buildDefaultHeatmap) shows samples between: 'current date - sampleFilter' and
  // 'current date + sampleFilter'.

  var sampleFilter = 120; // expressed in minutes

  // This adds a tile layer to the map
  var roadsLayer = L.tileLayer(tileServerURL, {

    attribution: credits,
  });

  // Creating a FeatureGroup for markers
  var markersLayer = new L.FeatureGroup();

  // Configuring the heatmap layer
  var config = {

    // Should be small only if scaleRadius is true (or small radius is intended);
    // if scaleRadius is false it will be the constant radius used in pixels
    "radius": 0.01,

    "maxOpacity": .9,
    "scaleRadius": true, // Scales the radius based on map zoom

    // false: the heatmap uses the global maximum for colorization
    // true: uses the data maximum within the current map boundaries
    // (there will always be a red spot with useLocalExtremas true)
    "useLocalExtrema": false,

    gradient: {

      '.25': 'rgb(0,0,255)', // blue
      '.55': 'rgb(0,255,0)', // green
      '.85': 'rgb(255,255,0)', // yellow
      '1': 'rgb(255,0,0)' // red
    },

    // blur: 0.3,       Blur factor that will be applied to all datapoints.
    //                  The higher the blur factor is, the smoother the gradients will be

    latField: 'lat', // which field name represents the latitude - default "lat"
    lngField: 'lng', // which field name represents the longitude - default "lng"
    valueField: 'count' // which field name represents the data value - default "count"
  };

  // Creating a layer for the heatmap
  var heatmapLayer = new HeatmapOverlay(config);

  // Maximum 'requiredData' value
  // (used as a reference value to render the heatmap)

  var maxRefValue = 30; // temperature heatmap: try 30 (maxRefValue) and 0 (minRefValue).
  var minRefValue = 0;

  // A map of the center of Messina (latitude, longitude)
  var map = L.map('mapdiv', {

    center: [latitude, longitude],
    zoom: inizialZoom,

    // Full screen options..
    fullscreenControlOptions: {

      position: 'topleft', // button position
      title: 'Full screen',
      forceSeparateButton: true // true: full screen button separated from zoom buttons
    },

    fullscreenControl: true,

    layers: [roadsLayer, heatmapLayer, markersLayer]
  });


  //   === Getting the resources ===

  function getResourcesList() {

    var extras = [];

    var jsonpCall = $.ajax({

      // Configuring the Ajax
      // request

      url: datasetsList_url,
      dataType: 'jsonp',
      async: false,
      cache: true,
      data: {
        "limit": 1000
      }, // Note: a limit of 100 is not enough!

    }); // $.ajax


    // Request is successful..
    jsonpCall.done(function(data) {

      $.each(data.result, function(index, value) {

        extras = value.extras;

        var lat;
        var long;

        if (value.num_resources > 0 && value.organization && value.organization.title == ckanOrganization && value.notes && (notWorkingBoards.indexOf(value.notes) < 0)) {

          datasets[index] = {

            id: value.id,
            label: "",
            name: value.name,
            lat: "",
            long: "",
            resources: [],
          };

          $.each(value.resources, function(ind, val) {

            if (val.name) {

              datasets[index]['resources'].push({
                name: val.name,
                id: val.id
              });
            }

          });

          if (extras.length) {

            for (var i = 0; i < extras.length; i++) {

              var record = extras[i];

              switch (record.key) {

                case "Label": datasets[index]['label'] = record.value;
                              break;

                case "Latitude": datasets[index]['lat'] = record.value;
                                 break;

                case "Longitude": datasets[index]['long'] = record.value;
                                  break;

              } // switch

            } // for

          } // if

        } // external if

      }); // external $.each

    }); // jsonpCall.done


    jsonpCall.fail(function() {

      console.log("Error | request to the database failed!");

    }); // jsonpCall.fail


    jsonpCall.then(function() {

      buildDefaultHeatmap();
    });


    // Adding the config. box..
    jsonpCall.then(function() {

      // 'startIt': the callback called when pressing the submit button
      // 'buildDefaultHeatmap': the callback called when an option is selected from the dropdown
      var cfgBox = new L.control.configBox(startIt, buildDefaultHeatmap, {
        "position": 'topright'
      });

      cfgBox.addTo(map);

    }); // jsonpCall.then

  } // function getResourcesList


  // Builds the default heatmap with the last-recorded
  // 'requiredData' samples (default is temperature).
  function buildDefaultHeatmap() {

    var dataset;
    var retrievedData;
    var resourceId;

    for (var i = 0; i < datasets.length; i++) {

      if (datasets[i]) {

        dataset = datasets[i];
        resourceId = getId(dataset.resources, requiredData);

        if (resourceId) {

          try {

            retrievedData = $.ajax({

              url: 'http://smartme-data.unime.it/api/action/datastore_search',
              async: false,
              cache: true,
              dataType: 'jsonp',

              data: {
                resource_id: resourceId,
                limit: 1,
                sort: "Date desc"
              }

            }); // $.ajax

            retrievedData.done(function(data) {

              if (data.result.records[0]) {

                // Preparing the filter for inactive sensors..
                var sampleTimestamp = moment.tz(data.result.records[0].Date, moment.ISO_8601, true, timeZone);
                var currentDate = moment.utc();
                var printOrNot = sampleTimestamp.isBetween(currentDate.clone().subtract(sampleFilter, 'minutes'), currentDate.clone().add(sampleFilter, 'minutes'));

                var textIcon;
                var marker;

                var lat = data.result.records[0].Latitude;
                var long = data.result.records[0].Longitude;
                var value = parseInt(data.result.records[0][capitalizeFirstLetter(requiredData)]);

                // A lightweight icon for markers that uses a simple <div> element
                // instead of an image.
                textIcon = L.divIcon({

                  className: "labelClass",
                  html: value
                });

                // Inactive sensors are 'n/a'
                if (!printOrNot) textIcon.options.html = 'n/a';

                marker = L.marker([lat, long], {

                  title: requiredData,
                  icon: textIcon
                });

                markersLayer.addLayer(marker);

                // Building the heatmap only for coherent data (old samples will not be
                // displayed)..
                if (printOrNot) heatmapLayer.addData({

                  lat: lat,
                  lng: long,
                  count: value
                });

              } // if

            }); // retrievedData.done

          } // try

          catch (err) {

            console.log("- Error reading data -", err.message);
          }

        } // if (resourceId)

      } // if

    } // for

  } // function buildDefaultHeatmap


  // Data retrieval (wrapper)
  function DataRetrieval(options) {

    var retrAll = options.downloadAll;

    this.init = function() {

      deferreds = [];
      fullData = [];
    };

    this.retrieve = function() {

      this.init();
      this.getData_sql();
    };

    this.getData_sql = function() {

      var resUrl = 'http://smartme-data.unime.it/api/action/datastore_search_sql';
      var resourceId;
      var dataAjxQuery;

      for (var i = 0; i < datasets.length; i++) {

        if (datasets[i]) {

          var obj = {};

          obj.label = datasets[i].label; // i.e. sme-01-0012, palazzo-mariani, sme-01-0011...
          obj.lat = datasets[i].lat;
          obj.lng = datasets[i].long;
          obj.id = datasets[i].id;
          obj.res = datasets[i].resources;
          obj[requiredData] = [];

          fullData.push(obj);

        } // if

      } // for loop

      $.each(fullData, function(ind, val) {

        try {

          if (val) {

            resourceId = getId(val.res, requiredData);

            if(resourceId) {   // checking if the variable resourceId is undefined
                               // before performing the AJAX request.

              dataAjxQuery = $.ajax({ // performs an SQL query

                url: resUrl,
                async: false,
                cache: true,
                dataType: 'jsonp',
                indx: ind,

                data: {
                  "sql": prepareSqlStatement(resourceId, retrAll)
                },

              }); // $.ajax

              dataAjxQuery.done(function(data) {

                var index = this.indx;

                fullData[index][requiredData] = data.result.records;
              });

            } // if (resourceId)

          } // if

        } // try

        catch (err) {

          console.log("- Error reading data -", err.message);

        } // catch

        deferreds.push(dataAjxQuery);

      }); //$.each

    }; // this.getData()

  } // function DataRetrieval


  // Returns: the SQL SELECT statement to retrieve data from the database
  // (see 'this.getData_sql')
  function prepareSqlStatement(resId, download) {

    var sqlStatement = '';
    var retrieveAllData = download;

    sqlStatement += 'SELECT';
    sqlStatement += ' ';
    sqlStatement += '"' + capitalizeFirstLetter(requiredData) + '"';
    sqlStatement += ', "Date" ';
    sqlStatement += 'from ' + '"' + resId + '" ';

    if (!retrieveAllData) {

      sqlStatement += 'WHERE "Date" BETWEEN TIMESTAMP WITH TIME ZONE ' + '\'' + hourlyConfig.to_thisDate.format() + '\' ' + 'AND TIMESTAMP WITH TIME ZONE ' + '\'' + hourlyConfig.from_thisDate.format() + '\' ';
    }

    sqlStatement += 'ORDER BY "Date" DESC';

    return sqlStatement;

    // It returns something like this:
    // SELECT "Temperature", "Date" from "e0a6d0e8-3d4b-4ee5-b418-51cb909364ae" WHERE "Date" BETWEEN TIMESTAMP WITH TIME ZONE '2017-05-10T11:06:51Z' AND TIMESTAMP WITH TIME ZONE '2017-05-11T11:06:51Z' ORDER BY "Date" DESC
  }


  // === Time machine code is here! ===

  function dataProcessingSel() {

    switch (dataProcSel) {

      case "hourly": hourlyTimeMachineData();
                     break;
    }
  }

  // - Time machine wrapper -

  // options.data: the processed data to be visualized
  // options.heatmapRefValue_max: the upper bound of the dataset (necessary to build the gradient).
  // options.heatmapRefValue_min: the lower bound of the dataset
  // options.heatmapCfg: other heatmap configurations

  function TimeMachine(options) {

    this.data = options.data;
    this.ref_max = options.heatmapRefValue_max;
    this.ref_min = options.heatmapRefValue_min;
    this.cfg = options.heatmapCfg;

    this.rev = options.reverse;
    // note: if reverse is true, the extreme right of the slider shows
    // the most recent samples. Warning: this feature is achieved
    // reversing the 'data' array (not its copy - just keep in mind
    // to avoid unexpected results!)

    this.position = options.sliderPosition;
    // the position of the slider
    // (possible values: 'topleft', 'topright', 'bottomleft' or 'bottomright')

    this.markersL = new L.FeatureGroup();
    this.heatmapL = new HeatmapOverlay(this.cfg);
    this.markersL.addTo(map);
    this.heatmapL.addTo(map);

    this.remove = function() {

      this._slider.remove();
      this.markersL.remove();
      this.heatmapL.remove();
    };

    // Prints the correct date (the one
    // corresponding to the input)
    this._getString = function(val) {

      return this.data[val].label;
    }.bind(this);

    this._timeTravel = function(val) {

      var marker;

      var text = L.divIcon({
        "className": "labelClass",
        "html": ""
      });

      var datap = this.data[val];

      var data = {
        "max": this.ref_max,
        "min": this.ref_min,
        "data": []
      };

      this.markersL.clearLayers();

      for (var i = 0; i < datap.length; i++) {

        if (datap[i].count) {

          text.options.html = datap[i].count;
          data.data.push(datap[i]);
        }

        else {

          if (!datap[i].count) text.options.html = 'n.a.';
        }

        marker = L.marker([datap[i].lat, datap[i].lng], {
          icon: text
        });

        this.markersL.addLayer(marker);
      }

      this.heatmapL.setData(data);
      // setData removes all previously existing points
      // from the heatmap instance and re-initializes the datastore

    }.bind(this);

    this.init = function() {

      var sliderCfg = { // slider configuration

        "width": '300px',
        "position": this.position, // 'topleft', 'topright', 'bottomleft' or 'bottomright'
        "min": 0,
        "max": this.data.length - 1,
        "value": 0,
        "title": 'time machine slider',
        "getString": this._getString,
        "increment": true, // true: increment and decrement buttons next to the slider
        "showValue": true, // true: show the input value next to the slider
        "showStringValue": true // true: show a string next to the slider, provided by the 'getString' method
      };

      if (this.rev) {

        this.data.reverse();
        sliderCfg.value = sliderCfg.max;
      }

      this._slider = new L.control.slider(this._timeTravel, sliderCfg);
      this._slider.addTo(map);
    };

    this.init();

  } // timeMachine


  // Starts the time machine
  function startIt() {

    var status = document.querySelector('#status');
    var subBtn = document.querySelector('#submitButton');
    var senSel = document.querySelector('#senselec');

    if (timeMachine) { // Removing (if any) the existing time machine instance

      timeMachine.remove();
    }

    // Prevent user to perform any actions while
    // downloading data
    subBtn.disabled = true;
    senSel.disabled = true;

    status.innerHTML = 'Status: downloading data';

    var data = new DataRetrieval({

      "downloadAll": retrieveAll
    }); // obtaining data from the database

    data.retrieve();

    $.when.apply($, deferreds).then(function() { // waiting on multiple asynchronous calls to complete..

      subBtn.disabled = false; // submit button is now enabled
      senSel.disabled = false;
      status.innerHTML = 'Status: -';

      dataProcessingSel(); // processing data

      // Clearing the map!
      markersLayer.remove();
      heatmapLayer.remove();

      // Creating a new time machine
      timeMachine = new TimeMachine({

        "data": hourlyConfig.heatmapDataPoints,
        "heatmapCfg": config,
        "heatmapRefValue_max": maxRefValue,
        "heatmapRefValue_min": minRefValue,
        "sliderPosition": 'bottomleft',

        "reverse": true,
        // note: if reverse is true, the extreme right of the slider shows the
        // most recent samples. Warning: this feature is achieved reversing the
        // 'data' array (not its copy - just keep in mind to avoid unexpected
        // results!)
      });

    }).fail(function () { // If data retrieval is not successful,
                          // the submit button is enabled again.

      subBtn.disabled = false; // submit button is now enabled
      senSel.disabled = false;
      status.innerHTML = 'Status: connection error - retry';

    }); // $.when.apply

  } // startIt function


  // Processing data on an hourly base.
  function hourlyTimeMachineData() {

    var date = hourlyConfig.from_thisDate.clone();
    var interval = hourlyConfig.ticksInterval; // interval between 'dataframes' (expressed in minutes)
    var until = hourlyConfig.to_thisDate.clone();

    hourlyConfig.heatmapDataPoints = [];

    var ind = 0;

    var cfg = {

      "ind": new Array(fullData.length),
      "min": "",
      "max": "",
      "ref": ""
    };

    cfg.ind.fill(0);

    // if 'true', samples are processed until the oldest one
    if (retrieveAll) {

      until = lessRecDate(fullData);
    }

    // i.e.: 'date' >= 'until',
    // 'date' is most recent than 'until'
    while ( date.isSameOrAfter(until) ) { // beginning from the most recent date..

      var dataForPeriod = [];

      cfg.min = date.clone().subtract(interval / 2, 'minutes');
      cfg.max = date.clone().add(interval / 2, 'minutes');
      cfg.ref = date;

      for (var i = 0; i < fullData.length; i++) {

        var obj = {};
        var el = searchValid(fullData[i][requiredData], i, cfg);

        obj.lat = fullData[i].lat;
        obj.lng = fullData[i].lng;

        if (el) obj.count = parseInt(el[capitalizeFirstLetter(requiredData)]);
        else obj.count = el;

        dataForPeriod.push(obj);

      } // external for

      hourlyConfig.heatmapDataPoints[ind] = dataForPeriod;
      hourlyConfig.heatmapDataPoints[ind].label = date.clone().tz(timeZone).format("DD/MM/YYYY, HH:mm"); // Slider label

      date.subtract(interval, 'minutes');

      ind++;

    } // external while
  }

  // If arr is empty, it returns undefined
  function searchValid(arr, id, cfg) {

    var starts = cfg.ind[id];
    var min = cfg.min;
    var max = cfg.max;
    var ref = cfg.ref;

    var acceptable = [];
    var ends = arr.length;

    for (var i = starts; i < ends; i++) {

      var date = moment.tz(arr[i].Date, moment.ISO_8601, true, timeZone);

      if (date.isBetween(min, max)) {

        acceptable.push(arr[i]);
        continue;
      }

      if (date.isBefore(min)) {

        break;
      }

    } // for

    cfg.ind[id] = i;

    if (acceptable.length > 0) return closestDateTo(acceptable, ref);
  }

  // Returns: undefined if arr is empty
  // (otherwise, an object).
  function closestDateTo( arr, ref ) {

    var i = 0;
    var el;
    var minDiff;

    var date;
    var diff;

    if ( arr ) {

      date = moment.tz( arr[0].Date, moment.ISO_8601, true, timeZone );
      minDiff = Math.abs( date.valueOf() - ref.valueOf() );
      el = arr[0];
    }

    for ( i in arr ) {

      date = moment.tz(arr[i].Date, moment.ISO_8601, true, timeZone);
      diff = Math.abs(date.valueOf() - ref.valueOf());

      if (diff < minDiff) {

        minDiff = diff;
        el = arr[i]
      }
    }

    return el;
  }


  // Gets the date of the oldest ('requiredData') sample;
  // note: to work, it needs that data is sorted in descending order (it means
  // it is ordered from the most recent sample to the oldest one)
  function lessRecDate(arr) {

    var olDate = hourlyConfig.from_thisDate.clone();
    var date;
    var arrLen;

    for ( var i = 0; i < arr.length; i++ ) {

      arrLen = arr[i][requiredData].length;

      if ( arr[i][requiredData][arrLen - 1] ) {

        date = moment.utc(arr[i][requiredData][arrLen - 1].Date, moment.ISO_8601, true, timeZone);

        if ( date.isSameOrBefore(olDate) ) olDate = date;
      }
    }

    return olDate;
  }


  //   === Custom controls ===

  // Slider
  L.Control.Slider = L.Control.extend({

    update: function( value ) { // The callback function receives the slider
                              // value (input by the human user)
      return value;
    },

    options: {

      width: '300px',
      position: 'bottomleft',
      min: 0,
      max: 11,
      id: "slider",
      value: 0, // input by the human user
      title: 'Leaflet Horizontal Slider',
      increment: true,

      getValue: function(value) {

        return value;
      },

      getString: function(value) {

        return '-';
      },

      showValue: true,
      showStringValue: true
    },

    initialize: function(f, options) {

      L.setOptions(this, options);

      if (typeof f == "function") {

        this.update = f;
      }

      else {

        this.update = function(value) {
          console.log(value);
        };
      }

      if (typeof this.options.getValue != "function") {

        this.options.getValue = function(value) {
          return value;
        };
      }

      if (typeof this.options.getString != "function") {

        this.options.getString = function(value) {
          return '-';
        };
      }
    }, // initialize

    onAdd: function(map) {

      this._initLayout();
      this.update(this.options.value + "");

      return this._container;
    },

    // Clean up code
    onRemove: function(map) {

      this._minus.remove();
      this.slider.remove();
      this._sliderContainer.remove();
      this._plus.remove();
      this._sliderValue.remove();
      this._container.remove();
    },

    _updateValue: function() {

      this.value = this.slider.value;

      if (this.options.showValue && !this.options.showStringValue) {

        this._sliderValue.innerHTML = this.options.getValue(this.value);
        this._sliderValue.style.width = '35px';
      }

      if (this.options.showValue && this.options.showStringValue) {

        this._sliderValue.innerHTML = this.options.getString(this.value);
      }

      this.update(this.value);
    },

    // layout and listeners
    _initLayout: function() {

      var className = 'leaflet-control-slider';

      this._container = L.DomUtil.create('div', className);

      if (this.options.showValue) { // showValue is true..

        this._sliderValue = L.DomUtil.create('p', className + '-value', this._container);

        if (!this.options.showStringValue) {

          this._sliderValue.innerHTML = this.options.getValue(this.options.value);
          this._sliderValue.style.width = '35px';
        }

        else {

          this._sliderValue.innerHTML = this.options.getString(this.options.value);
        }
      }

      if (this.options.increment) {

        this._plus = L.DomUtil.create('a', className + '-plus', this._container); // leaflet-control-slider-plus
        this._plus.innerHTML = "+";

        L.DomEvent.on(this._plus, 'click', this._increment, this);
        L.DomUtil.addClass(this._container, 'leaflet-control-slider-incdec');
      }

      this._sliderContainer = L.DomUtil.create('div', 'leaflet-slider-container', this._container);
      this.slider = L.DomUtil.create('input', 'leaflet-slider', this._sliderContainer);

      this.slider.title = this.options.title;
      this.slider.id = this.options.id;
      this.slider.type = "range";
      this.slider.min = this.options.min;
      this.slider.max = this.options.max;
      this.slider.step = 1;
      this.slider.value = this.options.value;

      L.DomEvent.on(this.slider, "input", function(e) {
        this._updateValue();
      }, this);

      if (this.options.increment) {

        this._minus = L.DomUtil.create('a', className + '-minus', this._container);
        this._minus.innerHTML = "-";
        L.DomEvent.on(this._minus, 'click', this._decrement, this);
      }

      if (this.options.showValue) {

        this._sliderContainer.style.width = (this.options.width.replace('px', '') - 0) + 'px';
      }

      else {

        this._sliderContainer.style.width = (this.options.width.replace('px', '') - 0) + 'px';
      }

      L.DomEvent.disableClickPropagation(this._container);

    }, // _initLayout

    _increment: function() {

      this.slider.value = this.slider.value * 1 + 1;
      this._updateValue();
    },

    _decrement: function() {

      this.slider.value = this.slider.value * 1 - 1;
      this._updateValue();
    }
  });

  L.control.slider = function(f, options) {

    return new L.Control.Slider(f, options);
  };


  // Configuration panel
  L.Control.ConfigBox = L.Control.extend({

    callback: function() {

      console.log("Callback function not set");
    },

    onChangeCallback: function() {

      console.log("Callback function (dropdown 'onchange' event) not set");
    },

    options: {

      position: 'topright'
    },

    initialize: function( machine_func, onChange_func, options ) {

      L.setOptions(this, options);

      if (typeof machine_func === "function") {
        this.callback = machine_func;
      }

      if (typeof onChange_func === "function") {
        this.onChangeCallback = onChange_func;
      }
    },

    onAdd: function(map) {

      this._initLayout();
      return this._container;
    },

    _validateGradBound: function(input) { // Basic input validation

      var isValid = true;

      var reg = new RegExp("[0-9]+, *[0-9]+"); // e.g.: 0, 30

      // note: trim() removes whitespace from both sides of the string
      var bound = input.trim().split(",");

      var lBound = parseInt(bound[0]);
      var uBound = parseInt(bound[1]);

      if ( !reg.test(input) ) return false;

      // note: isNaN() determines whether a value is an illegal number (Not-a-Number)
      isValid = (lBound !== "" && lBound !== " " && !isNaN(lBound)) && (uBound !== "" && uBound !== " " && !isNaN(uBound));

      return isValid;
    },

    // rDate and pDate are strings values
    // representing a date.
    _validateDate: function(rDate, pDate) {

      var rDateObj = moment.tz(rDate, "DD/MM/YYYY, HH:mm", true, timeZone); // true -> Strict parsing.
      var pDateObj = moment.tz(pDate, "DD/MM/YYYY, HH:mm", true, timeZone); // Strict parsing requires that the format and input match exactly,
                                                                            // including delimeters.
      var current = moment.utc(); // Current date and time.

      return rDateObj.isValid() && pDateObj.isValid() && rDateObj.isAfter(pDateObj) && rDateObj.isSameOrBefore(current);
    },

    _buildLastSampleHeatmap: function(event) {

      if (event.target.id === 'senselec') {

        // Clearing the map!
        heatmapLayer.remove();
        markersLayer.clearLayers();

        heatmapLayer = new HeatmapOverlay(config);

        if (!map.hasLayer(heatmapLayer)) heatmapLayer.addTo(map);
        if (!map.hasLayer(markersLayer)) markersLayer.addTo(map);

        if (timeMachine) {

          timeMachine.remove();
        }

        requiredData = event.target.value;

        buildDefaultHeatmap();
      }
    },

    _onClick: function(event) {

      var dateSelFrom = document.querySelector('#showfrom');
      var dateSelTo = document.querySelector('#showto');
      var sens = document.querySelector('#senselec');
      var gradBound = document.querySelector('#bound');
      var datafrInterv = document.querySelector('#datafinterv');
      var status = document.querySelector('#status');

      // Handling checkbox event
      if (event.target.id === 'cbdownloadall') {

        if (retrieveAll) {

          retrieveAll = false;
          dateSelTo.disabled = false;
          dateSelFrom.disabled = false;
        }

        else {

          retrieveAll = true;
          dateSelFrom.disabled = true;
          dateSelTo.disabled = true;
        }
      }

      if (event.target.id === 'submitButton') {

        var isValid = true;

        if (!this._validateDate(dateSelFrom.value, dateSelTo.value)) isValid = false;

        if (!this._validateGradBound(gradBound.value)) isValid = false;

        if (isNaN(datafrInterv.value)) isValid = false;

        if (isValid) {

          var uBound = gradBound.value.trim().split(",")[1];
          var lBound = gradBound.value.trim().split(",")[0];

          status.innerHTML = "Status: ok";
          maxRefValue = parseInt(uBound);
          minRefValue = parseInt(lBound);
          hourlyConfig.ticksInterval = parseInt(datafrInterv.value);
          requiredData = sens.value;

          // Updating configuration
          hourlyConfig.from_thisDate = moment.tz(dateSelFrom.value, "DD/MM/YYYY, HH:mm", timeZone); // Parsing in zone (timeZone value is Europe/Rome)
          hourlyConfig.to_thisDate = moment.tz(dateSelTo.value, "DD/MM/YYYY, HH:mm", timeZone);

          this.callback();
        }

        else status.innerHTML = "Status: please check your input!";
      }
    },

    _dropdownOpz: function(arr, sel) {

      var cont = '';

      for (var i = 0; i < arr.length; i++) {

        cont += '<option ';

        if (arr[i] === sel) {

          cont += 'selected ';
        }

        cont += 'value="' + arr[i] + '">' + capitalizeFirstLetter(arr[i]) + '</option>';
      }

      return cont;
    },

    _initLayout: function() {

      var className = 'leaflet-control-config'; // leaflet-control-config
      var dropdownClass = '"' + className + '-dropdown' + '"'; // leaflet-control-config-dropdown
      var checkboxClass = '"' + className + '-checkbox' + '"'; // leaflet-control-config-checkbox
      var inputClass = '"' + className + '-input' + '"'; // leaflet-control-config-input
      var buttonClass = '"' + className + '-submit' + '"'; // leaflet-control-config-submit
      var statusClass = '"' + className + '-status' + '"'; // leaflet-control-config-status

      var fromDate = hourlyConfig.from_thisDate.clone().tz(timeZone).format("DD/MM/YYYY, HH:mm"); // Converting to zone: Europe/Rome
      var toDate = hourlyConfig.to_thisDate.clone().tz(timeZone).format("DD/MM/YYYY, HH:mm"); // note: the value shown as placeholder into the input box is a date in local time zone

      var content = '<label for="senselec">Sensor: </label>' +
        '<select title="Select the data to visualize" class=' + dropdownClass + ' ' + 'id="senselec" name="senselec">' + // <select title="Select the data to visualize" class="leaflet-control-config-dropdown" id="senselec" name="senselec">
        this._dropdownOpz(sens_ls, requiredData) +
        '</select>' +

        '<input  type="checkbox" class=' + checkboxClass + ' ' + 'id="cbdownloadall">' +
        '<label title="Check if you want to download the entire dataset for the selected sensor ( it might take a while! )" for="cbdownloadall">Download the entire dataset</label><br><br>' +

        '<label for="bound">Lower bound / Upper bound: </label>' +
        '<input placeholder="Please, insert a number" title="Set the lower bound / upper bound for the gradient" type="text" class=' + inputClass + ' ' + 'id="bound" name="lowerupperbound" value="' + minRefValue + ', ' + maxRefValue + '"' + '>' +

        '<label for="datafinterv">\'Dataframe\' interval: </label>' +
        '<input placeholder="Expressed in minutes" title="Set the interval between \'dataframes\' ( time machine )" type="text" class=' + inputClass + ' ' + 'id="datafinterv" name="dataframeinterval" value="' + hourlyConfig.ticksInterval + '"' + '>' +

        '<label for="showfrom">From ( dd/mm/yyyy, --:-- ): </label>' +
        '<input placeholder="Please, insert a valid date" title="Set the starting date" type="text" class=' + inputClass + ' ' + 'id="showfrom" name="showfromdate" value="' + fromDate + '"' + '>' +

        '<label for="showto">To ( dd/mm/yyyy, --:-- ): </label>' +
        '<input placeholder="Please, insert a valid date" title="Set the ending date" type="text" class=' + inputClass + ' ' + 'id="showto" name="showtodate" value="' + toDate + '"' + '>' +

        '<p id="status" class=' + statusClass + ' ' + '>Status: - </p>' +

        '<input type="button" id="submitButton" class=' + buttonClass + ' ' + 'value="Submit">';


      this._container = L.DomUtil.create('div', className);
      this._container.innerHTML = content;

      L.DomEvent.on(this._container, 'change', this._buildLastSampleHeatmap, this);
      L.DomEvent.on(this._container, 'click', this._onClick, this);
      L.DomEvent.disableClickPropagation(this._container);

    } // init function

  });

  L.control.configBox = function(machine_func, onChange_func, options) {

    return new L.Control.ConfigBox(machine_func, onChange_func, options);
  };

  getResourcesList();

}); // $( document ).ready


// === Functions ===

function capitalizeFirstLetter(string) {

  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Gets the resource_id corresponding to the required data (temperature,
// brightness, humidity, etc.)
function getId(resources, sensor) {

  var data = resources;

  for (var j = 0; j < data.length; j++) {

    if (data[j]['name'] === sensor) {

      return data[j]['id'];
    }
  }
}
