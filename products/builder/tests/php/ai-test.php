<?php
/**
 * AI gateway: key encryption, permissions, provider request shapes (HTTP mocked).
 *
 * @package Auvyx\Builder
 */

use Auvyx\Builder\Modules\Ai\Ai;

/**
 * Mocks the provider: records the request, answers like the given provider.
 *
 * @param string $provider openai|anthropic.
 * @return array{0: callable, 1: ArrayObject}
 */
function auvyx_test_mock_provider( string $provider ): array {
	$seen = new ArrayObject();
	$mock = static function ( $pre, $args, $url ) use ( $provider, $seen ) {
		$seen['url']     = $url;
		$seen['headers'] = $args['headers'];
		$seen['body']    = json_decode( $args['body'], true );
		$body            = 'anthropic' === $provider
			? array(
				'model'   => 'claude-test',
				'content' => array(
					array(
						'type' => 'text',
						'text' => '{"message":"ok","ops":[]}',
					),
				),
			)
			: array(
				'model'   => 'gpt-test',
				'choices' => array( array( 'message' => array( 'content' => '{"message":"ok","ops":[]}' ) ) ),
			);
		return array(
			'headers'  => array(),
			'body'     => wp_json_encode( $body ),
			'response' => array(
				'code'    => 200,
				'message' => 'OK',
			),
			'cookies'  => array(),
		);
	};
	add_filter( 'pre_http_request', $mock, 10, 3 );
	return array( $mock, $seen );
}

function auvyx_test_ai_request( array $messages ): WP_REST_Response {
	$request = new WP_REST_Request( 'POST', '/auvyx/v1/ai/chat' );
	$request->set_header( 'Content-Type', 'application/json' );
	$request->set_body(
		wp_json_encode(
			array(
				'system'   => 'You are a test.',
				'messages' => $messages,
			)
		)
	);
	return rest_do_request( $request );
}

auvyx_test(
	'ai: the key is stored encrypted, never in clear, and decrypts back',
	static function () {
		$stored = Ai::encrypt( 'sk-secret-123' );
		auvyx_assert_not_contains( 'sk-secret', $stored );
		auvyx_assert_same( 'sk-secret-123', Ai::decrypt( $stored ) );
		auvyx_assert_same( '', Ai::decrypt( 'garbage' ), 'tampered value' );

		$ai    = new Ai();
		$saved = $ai->sanitize(
			array(
				'provider' => 'openai',
				'base_url' => 'https://openrouter.ai/api/v1',
				'model'    => 'm',
				'api_key'  => 'sk-secret-123',
			)
		);
		auvyx_assert_not_contains( 'sk-secret', wp_json_encode( $saved ) );
		update_option( Ai::OPTION, $saved );
		$kept = $ai->sanitize(
			array(
				'provider' => 'openai',
				'model'    => 'm2',
				'api_key'  => '',
			)
		);
		auvyx_assert_same( $saved['key'], $kept['key'], 'an empty key field keeps the stored key' );
		auvyx_assert_same( '', $ai->sanitize( array( 'remove_key' => '1' ) )['key'] );
		auvyx_assert_same( false, isset( Ai::public_config()['key'] ), 'the studio never gets the key' );
	}
);

auvyx_test(
	'ai: chat needs edit_posts and a configured provider',
	static function () {
		delete_option( Ai::OPTION );
		wp_set_current_user( 0 );
		$denied = auvyx_test_ai_request( array( array( 'role' => 'user', 'content' => 'hi' ) ) );
		auvyx_assert_same( 401, $denied->get_status() );

		wp_set_current_user( wp_insert_user( array( 'user_login' => 'auvyx_ai_editor', 'user_pass' => 'x', 'role' => 'editor' ) ) );
		$unconfigured = auvyx_test_ai_request( array( array( 'role' => 'user', 'content' => 'hi' ) ) );
		auvyx_assert_same( 400, $unconfigured->get_status() );
		auvyx_assert_same( 'auvyx_ai_not_configured', $unconfigured->get_data()['code'] );
	}
);

auvyx_test(
	'ai: OpenAI-compatible and Anthropic requests carry the key server-side and return the text',
	static function () {
		wp_set_current_user( wp_insert_user( array( 'user_login' => 'auvyx_ai_editor2', 'user_pass' => 'x', 'role' => 'editor' ) ) );
		foreach ( array( 'openai', 'anthropic' ) as $provider ) {
			update_option(
				Ai::OPTION,
				array(
					'provider' => $provider,
					'base_url' => 'https://openrouter.ai/api/v1/',
					'model'    => 'test-model',
					'key'      => Ai::encrypt( 'sk-test' ),
				)
			);
			list( $mock, $seen ) = auvyx_test_mock_provider( $provider );
			$response            = auvyx_test_ai_request(
				array(
					array( 'role' => 'user', 'content' => 'make a hero' ),
					array( 'role' => 'system', 'content' => 'ignored: only user/assistant pass' ),
				)
			);
			remove_filter( 'pre_http_request', $mock, 10 );
			auvyx_assert_same( 200, $response->get_status(), $provider . ': ' . wp_json_encode( $response->get_data() ) );
			auvyx_assert_same( '{"message":"ok","ops":[]}', $response->get_data()['content'] );
			if ( 'anthropic' === $provider ) {
				auvyx_assert_same( 'https://api.anthropic.com/v1/messages', $seen['url'] );
				auvyx_assert_same( 'sk-test', $seen['headers']['x-api-key'] );
				auvyx_assert_same( 'You are a test.', $seen['body']['system'] );
				auvyx_assert_same( 1, count( $seen['body']['messages'] ) );
			} else {
				auvyx_assert_same( 'https://openrouter.ai/api/v1/chat/completions', $seen['url'] );
				auvyx_assert_same( 'Bearer sk-test', $seen['headers']['Authorization'] );
				auvyx_assert_same( 'system', $seen['body']['messages'][0]['role'] );
				auvyx_assert_same( 2, count( $seen['body']['messages'] ) );
			}
		}
		delete_option( Ai::OPTION );
	}
);

auvyx_test(
	'ai: the stream route needs edit_posts and a provider, and answers with an ordinary error before it takes over',
	static function () {
		delete_option( Ai::OPTION );
		$request = static function () {
			$request = new WP_REST_Request( 'POST', '/auvyx/v1/ai/stream' );
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( array( 'system' => 's', 'messages' => array( array( 'role' => 'user', 'content' => 'hi' ) ) ) ) );
			return rest_do_request( $request );
		};
		wp_set_current_user( 0 );
		auvyx_assert_same( 401, $request()->get_status() );
		wp_set_current_user( wp_insert_user( array( 'user_login' => 'auvyx_ai_streamer', 'user_pass' => 'x', 'role' => 'editor' ) ) );
		$response = $request();
		auvyx_assert_same( 400, $response->get_status() );
		auvyx_assert_same( 'auvyx_ai_not_configured', $response->get_data()['code'] );
	}
);

auvyx_test(
	'ai: stream events of both providers become text pieces, errors, or nothing',
	static function () {
		$openai = static function ( $piece ) {
			return Ai::stream_piece( 'openai', wp_json_encode( $piece ) );
		};
		auvyx_assert_same( 'Hi', $openai( array( 'choices' => array( array( 'delta' => array( 'content' => 'Hi' ) ) ) ) )['text'] );
		auvyx_assert_same( '', $openai( array( 'choices' => array( array( 'delta' => array( 'role' => 'assistant' ) ) ) ) )['text'], 'the opening delta has no text' );
		auvyx_assert_same( '', $openai( array( 'choices' => array() ) )['text'], 'a usage-only event has no choices' );
		auvyx_assert_same( 'Rate limit', $openai( array( 'error' => array( 'message' => 'Rate limit' ) ) )['error'] );
		auvyx_assert_same( 'plain', $openai( array( 'error' => 'plain' ) )['error'], 'an error that is just a string' );

		$anthropic = static function ( $piece ) {
			return Ai::stream_piece( 'anthropic', wp_json_encode( $piece ) );
		};
		auvyx_assert_same( 'Yo', $anthropic( array( 'type' => 'content_block_delta', 'delta' => array( 'type' => 'text_delta', 'text' => 'Yo' ) ) )['text'] );
		auvyx_assert_same( '', $anthropic( array( 'type' => 'content_block_delta', 'delta' => array( 'type' => 'thinking_delta', 'thinking' => 'hmm' ) ) )['text'], 'thinking is not shown' );
		auvyx_assert_same( '', $anthropic( array( 'type' => 'message_start' ) )['text'] );
		auvyx_assert_same( 'Overloaded', $anthropic( array( 'type' => 'error', 'error' => array( 'type' => 'overloaded_error', 'message' => 'Overloaded' ) ) )['error'] );

		auvyx_assert_same( array( 'text' => '', 'error' => '', 'cut' => false ), Ai::stream_piece( 'openai', 'not json' ) );
		auvyx_assert_same( 500, strlen( Ai::stream_piece( 'openai', wp_json_encode( array( 'error' => str_repeat( 'x', 900 ) ) ) )['error'] ), 'long errors are cut' );
	}
);

auvyx_test(
	'ai: tool-call fragments assemble into one call, and a stop flushes what is still open',
	static function () {
		$open  = array();
		$start = array(
			'choices' => array(
				array(
					'delta' => array(
						'tool_calls' => array(
							array(
								'index'    => 0,
								'id'       => 'c1',
								'function' => array(
									'name'      => 'edit',
									'arguments' => '',
								),
							),
						),
					),
				),
			),
		);
		auvyx_assert_same( array(), Ai::take_tools( 'openai', wp_json_encode( $start ), $open ), 'a fragment is not a call yet' );
		$rest = array(
			'choices' => array(
				array(
					'delta'         => array(
						'tool_calls' => array(
							array(
								'index'    => 0,
								'function' => array( 'arguments' => '{"ops":[]}' ),
							),
						),
					),
					'finish_reason' => 'tool_calls',
				),
			),
		);
		$second = Ai::take_tools( 'openai', wp_json_encode( $rest ), $open );
		auvyx_assert_same( 'edit', $second[0]['name'] );
		auvyx_assert_same( '{"ops":[]}', $second[0]['arguments'] );
		auvyx_assert_same( 'c1', $second[0]['id'] );

		$anth = array();
		Ai::take_tools(
			'anthropic',
			wp_json_encode(
				array(
					'type'          => 'content_block_start',
					'index'         => 1,
					'content_block' => array(
						'type'  => 'tool_use',
						'id'    => 't1',
						'name'  => 'edit',
						'input' => array(),
					),
				)
			),
			$anth
		);
		Ai::take_tools(
			'anthropic',
			wp_json_encode(
				array(
					'type'  => 'content_block_delta',
					'index' => 1,
					'delta' => array(
						'type'         => 'input_json_delta',
						'partial_json' => '{"ops"',
					),
				)
			),
			$anth
		);
		$done = Ai::take_tools( 'anthropic', wp_json_encode( array( 'type' => 'content_block_stop', 'index' => 1 ) ), $anth );
		auvyx_assert_same( '{"ops"', $done[0]['arguments'], 'argument pieces are concatenated' );
		auvyx_assert_same( array(), $anth, 'a finished call leaves the buffer' );
	}
);

auvyx_test(
	'ai: tool calls are forwarded in each provider\'s shape',
	static function () {
		update_option( Ai::OPTION, array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'm', 'key' => Ai::encrypt( 'sk' ) ) );
		$messages = array(
			array( 'role' => 'user', 'content' => 'hi' ),
			array( 'role' => 'assistant', 'content' => 'On it', 'toolCalls' => array( array( 'id' => 'c1', 'name' => 'edit', 'arguments' => '{"ops":[]}' ) ) ),
			array( 'role' => 'tool', 'toolCallId' => 'c1', 'content' => 'Applied 1.' ),
		);
		$tools = array( array( 'name' => 'edit', 'description' => 'Edit the page', 'parameters' => array( 'type' => 'object', 'properties' => array( 'ops' => array( 'type' => 'array' ) ) ) ) );
		foreach ( array( 'openai', 'anthropic' ) as $provider ) {
			update_option( Ai::OPTION, array( 'provider' => $provider, 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'm', 'key' => Ai::encrypt( 'sk' ) ) );
			list( $mock, $seen ) = auvyx_test_mock_provider( $provider );
			Ai::complete( 'sys', $messages, $tools );
			remove_filter( 'pre_http_request', $mock, 10 );
			if ( 'anthropic' === $provider ) {
				auvyx_assert_same( 'edit', $seen['body']['tools'][0]['name'] );
				auvyx_assert_same( 'tool_use', $seen['body']['messages'][1]['content'][1]['type'] );
				auvyx_assert_same( 'tool_result', $seen['body']['messages'][2]['content'][0]['type'] );
				auvyx_assert_same( 'c1', $seen['body']['messages'][2]['content'][0]['tool_use_id'] );
			} else {
				auvyx_assert_same( 'edit', $seen['body']['tools'][0]['function']['name'] );
				auvyx_assert_same( 'c1', $seen['body']['messages'][2]['tool_calls'][0]['id'] );
				auvyx_assert_same( 'tool', $seen['body']['messages'][3]['role'] );
				auvyx_assert_same( 'c1', $seen['body']['messages'][3]['tool_call_id'] );
			}
		}
		delete_option( Ai::OPTION );
	}
);

auvyx_test(
	'ai: a provider that stopped at its output limit is reported, not mistaken for a finished answer',
	static function () {
		$openai = Ai::stream_piece( 'openai', wp_json_encode( array( 'choices' => array( array( 'delta' => array( 'content' => null ), 'finish_reason' => 'length' ) ) ) ) );
		auvyx_assert_same( true, $openai['cut'] );
		auvyx_assert_same( false, Ai::stream_piece( 'openai', wp_json_encode( array( 'choices' => array( array( 'delta' => array(), 'finish_reason' => 'stop' ) ) ) ) )['cut'] );
		auvyx_assert_same( true, Ai::stream_piece( 'anthropic', wp_json_encode( array( 'type' => 'message_delta', 'delta' => array( 'stop_reason' => 'max_tokens' ) ) ) )['cut'] );
		auvyx_assert_same( false, Ai::stream_piece( 'anthropic', wp_json_encode( array( 'type' => 'message_delta', 'delta' => array( 'stop_reason' => 'end_turn' ) ) ) )['cut'] );

		// The non-streaming answer says it too.
		update_option( Ai::OPTION, array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'm', 'key' => Ai::encrypt( 'sk' ) ) );
		$mock = static function () {
			return array(
				'headers'  => array(),
				'body'     => wp_json_encode( array( 'model' => 'm', 'choices' => array( array( 'message' => array( 'content' => '{"message":"cut' ), 'finish_reason' => 'length' ) ) ) ),
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'cookies'  => array(),
			);
		};
		add_filter( 'pre_http_request', $mock, 10, 3 );
		$answer = Ai::complete( 's', array( array( 'role' => 'user', 'content' => 'hi' ) ) );
		remove_filter( 'pre_http_request', $mock, 10 );
		delete_option( Ai::OPTION );
		auvyx_assert_same( true, $answer['cut_off'] );
	}
);

auvyx_test(
	'ai settings: a provider that cannot use the key or model is refused, and the working setup is kept',
	static function () {
		auvyx_assert_contains( 'OpenRouter', Auvyx\Builder\Modules\Ai\Ai::mismatch( 'anthropic', 'anthropic/claude-haiku-5.5', 'sk-or-v1-x' ) );
		auvyx_assert_contains( 'OpenRouter', Auvyx\Builder\Modules\Ai\Ai::mismatch( 'anthropic', 'claude-x', 'sk-or-v1-x' ) );
		auvyx_assert_contains( 'Anthropic', Auvyx\Builder\Modules\Ai\Ai::mismatch( 'openai', 'gpt-x', 'sk-ant-x' ) );
		auvyx_assert_same( '', Auvyx\Builder\Modules\Ai\Ai::mismatch( 'anthropic', 'claude-sonnet-4-5', 'sk-ant-x' ) );
		auvyx_assert_same( '', Auvyx\Builder\Modules\Ai\Ai::mismatch( 'openai', 'anthropic/claude-haiku-5.5', 'sk-or-v1-x' ) );
		$working = array( 'provider' => 'openai', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'anthropic/claude-haiku-5.5', 'key' => Auvyx\Builder\Modules\Ai\Ai::encrypt( 'sk-or-v1-x' ) );
		update_option( Auvyx\Builder\Modules\Ai\Ai::OPTION, $working );
		$ai    = new Auvyx\Builder\Modules\Ai\Ai();
		$saved = $ai->sanitize( array( 'provider' => 'anthropic', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'anthropic/claude-haiku-5.5' ) );
		auvyx_assert_same( 'openai', $saved['provider'], 'the working provider stays' );
	}
);

auvyx_test(
	'ai: a provider preset sets the API and its address; old settings read as their preset; the key survives the double save',
	static function () {
		$ai = new \Auvyx\Builder\Modules\Ai\Ai();
		delete_option( \Auvyx\Builder\Modules\Ai\Ai::OPTION );
		$gemini = $ai->sanitize( array( 'preset' => 'gemini', 'model' => 'gemini-2.5-flash', 'api_key' => 'g-key' ) );
		auvyx_assert_same( 'openai', $gemini['provider'], 'Gemini speaks the OpenAI-compatible API' );
		auvyx_assert_same( 'https://generativelanguage.googleapis.com/v1beta/openai', $gemini['base_url'], 'its address when none is given' );
		auvyx_assert_same( 'g-key', \Auvyx\Builder\Modules\Ai\Ai::decrypt( $gemini['key'] ) );
		auvyx_assert_same( $gemini['key'], $ai->sanitize( $gemini )['key'], 'WordPress sanitizes a new option twice' );
		$claude = $ai->sanitize( array( 'preset' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'base_url' => 'https://evil.example' ) );
		auvyx_assert_same( array( 'anthropic', '' ), array( $claude['provider'], $claude['base_url'] ) );
		auvyx_assert_same( 'openrouter', \Auvyx\Builder\Modules\Ai\Ai::preset_of( 'openai', 'https://openrouter.ai/api/v1/' ) );
		auvyx_assert_same( 'custom', \Auvyx\Builder\Modules\Ai\Ai::preset_of( 'openai', 'http://10.0.0.5:8000/v1' ) );
	}
);

auvyx_test(
	'ai: the connection test asks the saved provider, for administrators only',
	static function () {
		$was = get_current_user_id();
		update_option( \Auvyx\Builder\Modules\Ai\Ai::OPTION, array( 'preset' => 'custom', 'provider' => 'openai', 'base_url' => 'https://llm.example/v1', 'model' => 'm1', 'key' => \Auvyx\Builder\Modules\Ai\Ai::encrypt( 'k1' ) ) );
		$seen = array();
		$fake = static function ( $pre, $args, $url ) use ( &$seen ) {
			$seen[] = array( $url, $args['headers']['Authorization'] ?? '' );
			return array( 'response' => array( 'code' => 200 ), 'body' => '{"model":"m1","choices":[{"message":{"content":"Ready"}}]}' );
		};
		add_filter( 'pre_http_request', $fake, 10, 3 );
		wp_set_current_user( 0 );
		auvyx_assert_same( 401, rest_do_request( new WP_REST_Request( 'POST', '/auvyx/v1/ai/test' ) )->get_status() );
		wp_set_current_user( 1 );
		$data = rest_do_request( new WP_REST_Request( 'POST', '/auvyx/v1/ai/test' ) )->get_data();
		remove_filter( 'pre_http_request', $fake, 10 );
		wp_set_current_user( $was );
		delete_option( \Auvyx\Builder\Modules\Ai\Ai::OPTION );
		auvyx_assert_same( true, $data['ok'] );
		auvyx_assert_same( 'Ready', $data['reply'] );
		auvyx_assert_same( array( 'https://llm.example/v1/chat/completions', 'Bearer k1' ), $seen[0] );
	}
);
