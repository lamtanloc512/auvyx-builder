<?php
/**
 * The Studio agent's gateway and conversations (Modules/Ai/Gateway, Sessions; ADR 0039).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Ai\Ai;
use Auvyx\Builder\Modules\Ai\Gateway;
use Auvyx\Builder\Modules\Ai\Sessions;
use Auvyx\Builder\Plugin;

function auvyx_test_agent_settings( array $settings ): void {
	update_option( Ai::OPTION, $settings + array( 'key' => Ai::encrypt( 'sk-test-secret' ) ) );
}

function auvyx_test_agent_rest( string $method, string $route, array $params = array() ): WP_REST_Response {
	$request = new WP_REST_Request( $method, $route );
	foreach ( $params as $name => $value ) {
		$request->set_param( $name, $value );
	}
	return rest_ensure_response( rest_do_request( $request ) );
}

auvyx_test(
	'agent gateway: Studio gets the gateway URL and the model catalog, never the key',
	static function () {
		auvyx_test_agent_settings( array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'openai/gpt-6-luna' ) );
		$config = Gateway::public_config();
		auvyx_assert_same( true, $config['configured'] );
		auvyx_assert_same( 'openai-completions', $config['api'] );
		auvyx_assert_same( 'openrouter', $config['provider'] );
		auvyx_assert_same( 'openai/gpt-6-luna', $config['model'] );
		auvyx_assert_contains( 'auvyx/v1/ai/gateway', $config['baseUrl'] );
		auvyx_assert_not_contains( 'sk-test-secret', wp_json_encode( $config ) );
		auvyx_test_agent_settings( array( 'provider' => 'anthropic', 'base_url' => '', 'model' => 'claude-x' ) );
		auvyx_assert_same( 'anthropic-messages', Gateway::public_config()['api'] );
		auvyx_test_agent_settings( array( 'provider' => 'openai', 'base_url' => 'http://localhost:11434/v1', 'model' => 'llama' ) );
		auvyx_assert_same( 'custom', Gateway::public_config()['provider'] );
	}
);

auvyx_test(
	'agent gateway: an empty object in the request stays an object (a tool schema with no properties, empty arguments)',
	static function () {
		auvyx_test_agent_settings( array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'openai/gpt-6-luna' ) );
		$body = Gateway::body( '{"model":"x","tools":[{"type":"function","function":{"name":"t","parameters":{"type":"object","properties":{"template":{"type":"object","properties":{}}}}}}],"messages":[{"role":"assistant","tool_calls":[{"function":{"arguments":"{}"}}],"content":[]}]}' );
		$sent = wp_json_encode( Gateway::upstream( 'chat/completions', $body, array() )['body'] );
		auvyx_assert_contains( '"template":{"type":"object","properties":{}}', $sent );
		auvyx_assert_contains( '"content":[]', $sent, 'an empty list stays a list' );
		auvyx_assert_contains( '"model":"openai\/gpt-6-luna"', $sent );
		auvyx_assert_same( null, Gateway::body( '[1,2]' ) );
		auvyx_assert_same( null, Gateway::body( 'not json' ) );
	}
);

auvyx_test(
	'agent gateway: answers where both SDKs post (OpenAI-compatible chat/completions, Anthropic v1/messages)',
	static function () {
		$routes = rest_get_server()->get_routes();
		$route  = array_values( array_filter( array_keys( $routes ), static fn( $r ) => false !== strpos( $r, 'ai/gateway' ) ) );
		auvyx_assert_same( 1, count( $route ) );
		foreach ( array( 'chat/completions', 'messages', 'v1/messages' ) as $path ) {
			auvyx_assert_same( 1, preg_match( '@^' . $route[0] . '$@', '/auvyx/v1/ai/gateway/' . $path ), $path );
		}
	}
);

auvyx_test(
	'agent gateway: the agent needs the site\'s own provider key (Auvyx Cloud runs no agent)',
	static function () {
		wp_set_current_user( 1 );
		delete_option( Ai::OPTION );
		$calls  = array();
		$server = static function ( $pre, $args, $url ) use ( &$calls ) {
			$calls[] = (string) $url;
			return $pre;
		};
		add_filter( 'pre_http_request', $server, 10, 3 );
		auvyx_assert_same( false, class_exists( 'Auvyx\\Builder\\Modules\\License\\License' ), 'Auvyx Builder has no licence of its own (it is Pro\'s)' );
		auvyx_assert_same( false, Gateway::configured(), 'nothing sets up the agent but the site\'s own key' );
		$config = Gateway::public_config();
		auvyx_assert_same( false, $config['configured'] );
		auvyx_assert_same( false, array_key_exists( 'service', $config ), 'no agent service is handed to the editors' );
		auvyx_assert_same( false, method_exists( Gateway::class, 'service' ) );
		auvyx_assert_same( false, method_exists( Gateway::class, 'cloud_api' ) );
		$answer = ( new Gateway() )->forward( new WP_REST_Request( 'POST', '/auvyx/v1/ai/gateway/chat/completions' ) );
		auvyx_assert_same( true, is_wp_error( $answer ) );
		auvyx_assert_contains( 'own AI provider key', is_wp_error( $answer ) ? $answer->get_error_message() : '' );
		auvyx_test_agent_settings( array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'openai/gpt-6-luna' ) );
		auvyx_assert_same( true, Gateway::configured(), 'the site\'s key and model are' );
		foreach ( $calls as $url ) {
			auvyx_assert_not_contains( '/agent/', $url, 'nothing asks Auvyx Cloud for an agent' );
		}
		remove_filter( 'pre_http_request', $server, 10 );
	}
);

auvyx_test(
	'agent config: no trace sink is handed to the editors (agent traces were removed)',
	static function () {
		auvyx_assert_same( false, array_key_exists( 'traces', Gateway::public_config() ) );
		auvyx_assert_same( false, method_exists( Gateway::class, 'traces' ) );
	}
);

auvyx_test(
	'agent gateway: forwards to the configured provider with its key and model, caps the answer, drops browser credentials',
	static function () {
		auvyx_test_agent_settings( array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1/', 'model' => 'openai/gpt-6-luna' ) );
		$up = Gateway::upstream(
			'chat/completions',
			array( 'model' => 'expensive/model', 'max_tokens' => 999999, 'stream' => true, 'messages' => array() ),
			array( 'x-session-affinity' => 'auvyx-1' )
		);
		auvyx_assert_same( 'https://openrouter.ai/api/v1/chat/completions', $up['url'] );
		auvyx_assert_same( 'openai/gpt-6-luna', $up['body']['model'] );
		auvyx_assert_same( Gateway::MAX_TOKENS, $up['body']['max_tokens'] );
		auvyx_assert_same( 'Bearer sk-test-secret', $up['headers']['Authorization'] );
		auvyx_assert_same( 'auvyx-1', $up['headers']['x-session-affinity'] );
		auvyx_assert_same( true, is_wp_error( Gateway::upstream( 'messages', array(), array() ) ), 'an OpenAI-compatible site does not forward Anthropic requests' );

		auvyx_test_agent_settings( array( 'provider' => 'anthropic', 'base_url' => '', 'model' => 'claude-x' ) );
		$up = Gateway::upstream( 'messages', array( 'model' => 'other' ), array() );
		auvyx_assert_same( 'https://api.anthropic.com/v1/messages', $up['url'] );
		auvyx_assert_same( 'sk-test-secret', $up['headers']['x-api-key'] );
		auvyx_assert_same( 'claude-x', $up['body']['model'] );
	}
);

auvyx_test(
	'agent gateway: only editors may use it',
	static function () {
		wp_set_current_user( 0 );
		$response = auvyx_test_agent_rest( 'POST', '/auvyx/v1/ai/gateway/chat/completions' );
		auvyx_assert_same( 401, $response->get_status() );
		wp_set_current_user( 1 );
	}
);

auvyx_test(
	'agent sessions: saved per user and document, read back intact, private to their author, removed',
	static function () {
		wp_set_current_user( 1 );
		$doc        = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Agent doc' ) );
		$transcript = wp_json_encode( array( array( 'role' => 'user', 'content' => 'Héllo "quoted" \\ <b>' ) ) );
		$saved      = auvyx_test_agent_rest( 'POST', '/auvyx/v1/ai/sessions', array( 'document' => $doc, 'title' => 'First', 'transcript' => $transcript ) );
		auvyx_assert_same( 200, $saved->get_status() );
		$id = $saved->get_data()['id'];

		$list = auvyx_test_agent_rest( 'GET', '/auvyx/v1/ai/sessions', array( 'document' => $doc ) )->get_data();
		auvyx_assert_same( array( $id ), array_column( $list, 'id' ) );
		auvyx_assert_same( $transcript, auvyx_test_agent_rest( 'GET', '/auvyx/v1/ai/sessions/' . $id )->get_data()['transcript'] );

		$updated = auvyx_test_agent_rest( 'POST', '/auvyx/v1/ai/sessions', array( 'document' => $doc, 'id' => (int) $id, 'title' => 'Renamed', 'transcript' => '[]' ) );
		auvyx_assert_same( $id, $updated->get_data()['id'] );
		auvyx_assert_same( 'Renamed', get_post( (int) $id )->post_title );

		auvyx_assert_same( 400, auvyx_test_agent_rest( 'POST', '/auvyx/v1/ai/sessions', array( 'document' => $doc, 'transcript' => 'not json{' ) )->get_status() );

		$other = wp_insert_user( array( 'user_login' => 'agent-other', 'user_pass' => wp_generate_password(), 'role' => 'editor' ) );
		wp_set_current_user( $other );
		auvyx_assert_same( 404, auvyx_test_agent_rest( 'GET', '/auvyx/v1/ai/sessions/' . $id )->get_status(), 'another user cannot read it' );
		auvyx_assert_same( array(), auvyx_test_agent_rest( 'GET', '/auvyx/v1/ai/sessions', array( 'document' => $doc ) )->get_data() );
		wp_set_current_user( 1 );

		auvyx_assert_same( 200, auvyx_test_agent_rest( 'DELETE', '/auvyx/v1/ai/sessions/' . $id )->get_status() );
		auvyx_assert_same( null, get_post( (int) $id ) );
	}
);

auvyx_test(
	'agent sessions: only the newest are kept per document',
	static function () {
		wp_set_current_user( 1 );
		$doc = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Busy doc' ) );
		for ( $i = 0; $i < Sessions::KEEP + 3; $i++ ) {
			auvyx_test_agent_rest( 'POST', '/auvyx/v1/ai/sessions', array( 'document' => $doc, 'title' => "S$i", 'transcript' => '[]' ) );
		}
		auvyx_assert_same( Sessions::KEEP, count( Sessions::of( $doc ) ) );
	}
);

auvyx_test(
	'agent sessions: deleting a document deletes its conversations',
	static function () {
		wp_set_current_user( 1 );
		$doc = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Short-lived' ) );
		$id  = (int) auvyx_test_agent_rest( 'POST', '/auvyx/v1/ai/sessions', array( 'document' => $doc, 'transcript' => '[]' ) )->get_data()['id'];
		wp_delete_post( $doc, true );
		auvyx_assert_same( null, get_post( $id ) );
	}
);

auvyx_test(
	'the agent reads a page as text: title, description, headings, links and body, and refuses other schemes',
	static function () {
		wp_set_current_user( 1 );
		$editor = Plugin::instance()->module( 'editor' );
		$html   = '<html><head><title>Bão Táp Tây Sơn</title><meta content="A history book." name="description">'
			. '<meta property="og:image" content="https://cdn.example.com/cover.jpg"></head>'
			. '<body><h1>Bão Táp</h1><h2>Quang Trung</h2><script>window.tracker()</script><p>199.000đ</p><a href="/mua">Mua ngay</a>'
			. '<img src="/uploads/book.png" alt="Bìa sách"><img src="data:image/gif;base64,R0lGOD"><img src="/pixel.gif"></body></html>';
		add_filter(
			'pre_http_request',
			static function () use ( $html ) {
				return array(
					'headers'  => array( 'content-type' => 'text/html; charset=utf-8' ),
					'body'     => $html,
					'response' => array( 'code' => 200, 'message' => 'OK' ),
					'cookies'  => array(),
					'filename' => null,
				);
			}
		);
		$request = new WP_REST_Request( 'POST' );
		$request->set_param( 'url', 'https://example.com/bao-tap' );
		$response = $editor->read_url( $request );
		remove_all_filters( 'pre_http_request' );
		$data = $response->get_data();
		auvyx_assert_same( 'Bão Táp Tây Sơn', $data['title'] );
		auvyx_assert_same( 'A history book.', $data['description'], 'the description reads whichever order its attributes come in' );
		auvyx_assert_same( array( 'H1: Bão Táp', 'H2: Quang Trung' ), $data['headings'] );
		auvyx_assert_contains( 'Mua ngay -> /mua', implode( "\n", $data['links'] ) );
		auvyx_assert_same( array( 'https://cdn.example.com/cover.jpg', 'https://example.com/uploads/book.png' ), $data['images'], 'absolute pictures, without data URIs or pixels' );
		auvyx_assert_contains( '199.000đ', $data['text'] );
		auvyx_assert_not_contains( 'tracker', $data['text'], 'a script is not content' );

		$bad = new WP_REST_Request( 'POST' );
		$bad->set_param( 'url', 'ftp://example.com/x' );
		auvyx_assert_same( true, is_wp_error( $editor->read_url( $bad ) ), 'only http(s)' );

		$local = new WP_REST_Request( 'POST' );
		$local->set_param( 'url', 'http://127.0.0.1/private' );
		auvyx_assert_same( true, is_wp_error( $editor->read_url( $local ) ), 'a private host is refused' );
	}
);
