import 'package:flutter_test/flutter_test.dart';
import 'package:town_pass/page/city_service/model/my_service_model.dart';

void main() {
  test('服務入口直接開啟鄰食轉運站首頁，保留單一 hash 路由', () {
    final service = MyServiceItemId.teamService.item;
    final uri = Uri.parse(service.destinationUrl);
    const configuredBase = String.fromEnvironment(
      'TEAM_WEB_URL',
      defaultValue: 'https://hackathon-taipei.github.io/TownPass/',
    );
    final base = Uri.parse(configuredBase);

    expect(service.title, '鄰食轉運站');
    expect(uri.scheme, base.scheme);
    expect(uri.host, base.host);
    expect(uri.port, base.port);
    expect(uri.path, base.path);
    expect(uri.query, base.query);
    expect(uri.fragment, '/f/meal-relay');
    expect('#'.allMatches(service.destinationUrl).length, 1);
  });
}
