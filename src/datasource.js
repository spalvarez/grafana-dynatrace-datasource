import _ from 'lodash';

export default class DynatraceDatasource {
  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.q = $q;

    this.id = instanceSettings.jsonData.id;
    this.token = instanceSettings.jsonData.token;

    this.Url = `https://${this.id}.live.dynatrace.com/api/v2`;

    this.headers = { Authorization: `Api-Token ${this.token}` };

    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
  }

  doMetricRequest(options) {
    options.url = `${this.Url}/metrics`;
    options.headers = this.headers;
    options.method = 'GET';
    return this.backendSrv.datasourceRequest(options);
  }

  doMetricDetailRequest(metric) {
    return this.backendSrv.datasourceRequest({
      url: `${this.Url}/metrics/${metric}`,
      method: 'GET',
      headers: this.headers,
    });
  }

  doMetricQueryRequest(options) {
    options.url = `${this.Url}/metrics/query`;
    options.method = 'GET';
    options.headers = this.headers;
    return this.backendSrv.datasourceRequest(options);
  }

  doEntityRequest(options) {
    options.url = `${this.Url}/entities`;
    options.method = 'GET';
    options.headers = this.headers;
    return this.backendSrv.datasourceRequest(options);
  }

  testDatasource() {
    return this.doMetricRequest({}).then(() => ({
      status: 'success', message: 'Data source is working', title: 'Success',
    })).catch(() => ({
      status: 'error', message: 'Datasource test failed', title: 'Error',
    }));
  }

  query(options) {
    const targets = _.filter(options.targets, (target => !target.hide));
    const fromTs = options.range.from._d.getTime();
    const toTs = options.range.to._d.getTime();
    const requests = [];

    Object.keys(targets).forEach((t) => {
      const opts = {
        params: {
          aggregationType: targets[t].aggregation,
          pageSize: 5000,
          metricSelector: targets[t].target,
          from: fromTs,
          to: toTs,
        },
      };
      requests[t] = this.doMetricQueryRequest(opts);
    });

    // TODO: this throws an error when one of the requests fails
    // Would be better to finish all requests which do work
    return this.q.all(requests).then((results) => {
      let metrics = [];

      Object.keys(results).forEach((r) => {
        const regexp = new RegExp(targets[r].filter);
        const m = DynatraceDatasource.processDatapoints(results[r].data.result);

        metrics = metrics.concat(_.filter(m, serie => regexp.test(serie.target)));
      });

      return { data: metrics };
    }).catch(() => ({
      data: [], // TODO: Handle properly
    }));
  }

  static findEntityName(entities, name) {
    return entities.filter(entity => entity.displayName === name).displayName;
  }

  static processDatapoints(results) {
    const r = [];
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      for (let d = 0; d < result.data.length; d += 1) {
        const dataValue = result.data[d];
        const dp = [];
        let label = '';

        for (let t = 0; t < dataValue.timestamps.length; t += 1) {
          dp.push([dataValue.values[t], dataValue.timestamps[t]]);
        }

        for (let l = 0; l < dataValue.dimensions.length; l += 1) {
          label += `${dataValue.dimensions[l]} `;
        }

        r.push({
          /* TODO: Label needs to be correlated to displayName from
             the entities API, this is just the entityID */
          target: label,
          datapoints: dp,
        });
      }
    }
    return r;
  }

  metricFindQuery() {
    // var interpolated = {
    //     target: this.templateSrv.replace(query, null, 'regex')
    // };

    return this.doMetricRequest({
      params: {
        pageSize: 5000,
      },
    }).then(DynatraceDatasource.getMetricNames);
  }

  metricFindDetails(query) {
    return this.doMetricDetailRequest(query).then((res) => {
      const entry = res;
      return entry;
    }).catch(() => (false));
  }

  static getMetricNames(result) {
    return _.map(result.data.metrics, d => (
      { text: `${d.displayName} - ${d.metricId}`, value: d.metricId }));
  }
}

